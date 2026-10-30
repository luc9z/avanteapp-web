/**
 * POST /ia — a IA do app, com a chave guardada aqui.
 *
 * Antes o app chamava a Groq direto do navegador e a chave ia dentro do
 * site publicado. Agora:
 *  - a chave é segredo do Worker (GROQ_API_KEY; GEMINI_API_KEY de reserva);
 *  - o prompt de sistema é montado AQUI a partir do modo (aiPrompts.js).
 *    O app não manda prompt, senão o servidor virava uma IA aberta;
 *  - cada conta tem um limite diário, e há um teto total por dia.
 */
import { MODES } from '../../src/services/aiPrompts.js'
import { ErroBanco } from './google.js'
import { Falha } from './falha.js'

const INDISPONIVEL = 'O assistente está indisponível no momento. Tente mais tarde.'
const LIMITE = 'Você chegou ao limite de perguntas de hoje. Amanhã libera de novo.'
const MAX_MENSAGENS = 12
const MAX_CARACTERES = 1500

/** Conta a pergunta do dia (conta e total). Duas ao mesmo tempo: uma tenta de novo. */
async function cotaIa(env, db, uid) {
  const porConta = Number(env.IA_POR_CONTA_DIA) || 60
  const total = Number(env.IA_TOTAL_DIA) || 3000
  const hoje = new Date().toISOString().slice(0, 10)
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const [conta, geral] = await Promise.all([db.ler(`iaUso/${uid}`), db.ler('iaUso/_total')])
    const n = d => (d && d.dados.dia === hoje ? Number(d.dados.n || 0) : 0)
    if (n(conta) >= porConta) throw new Falha(429, 'limite', LIMITE)
    if (n(geral) >= total) throw new Falha(429, 'limite', INDISPONIVEL)
    const pre = d => (d ? { updateTime: d.atualizadoEm } : { exists: false })
    try {
      await db.commit([
        db.escrita(`iaUso/${uid}`, { dia: hoje, n: n(conta) + 1 }, pre(conta)),
        db.escrita('iaUso/_total', { dia: hoje, n: n(geral) + 1 }, pre(geral)),
      ])
      return
    } catch (e) {
      if (!(e instanceof ErroBanco) || ![400, 409].includes(e.status)) throw e
    }
  }
  throw new Falha(429, 'limite', 'Muitas perguntas ao mesmo tempo. Tente de novo em instantes.')
}

function historicoValido(mensagens) {
  if (!Array.isArray(mensagens) || mensagens.length === 0) return null
  const h = mensagens.slice(-MAX_MENSAGENS).map(m => ({
    role: m && m.role === 'assistant' ? 'assistant' : 'user',
    content: String((m && m.content) || '').slice(0, MAX_CARACTERES),
  }))
  return h.some(m => m.role === 'user' && m.content.trim()) ? h : null
}

export async function ia(env, db, eu, dados) {
  const cfg = Object.hasOwn(MODES, dados.mode) ? MODES[dados.mode] : null
  if (!cfg) throw new Falha(400, 'invalido', 'Modo de IA inválido.')
  const historico = historicoValido(dados.messages)
  if (!historico) throw new Falha(400, 'invalido', 'Escreva a pergunta.')
  if (!env.GROQ_API_KEY && !env.GEMINI_API_KEY) throw new Falha(503, 'indisponivel', INDISPONIVEL)

  const contexto = dados.context && typeof dados.context === 'object' ? dados.context : {}
  const sistema = cfg.build(contexto)

  await cotaIa(env, db, eu.uid)
  const texto = env.GROQ_API_KEY
    ? await viaGroq(env, cfg, sistema, historico)
    : await viaGemini(env, cfg, sistema, historico)
  return { texto }
}

/* ── Groq (API compatível com OpenAI) ── */
async function viaGroq(env, cfg, sistema, historico) {
  let res
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: cfg.groq,
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
        ...(cfg.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [{ role: 'system', content: sistema }, ...historico],
      }),
      signal: AbortSignal.timeout(25000),
    })
  } catch (e) {
    console.error('groq fora do ar:', e?.message)
    throw new Falha(503, 'indisponivel', INDISPONIVEL)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('groq', res.status, data?.error?.message)
    // 429 é cota estourada - vale dizer, porque a saída é esperar.
    if (res.status === 429) throw new Falha(429, 'limite', 'Muitas perguntas seguidas. Espere alguns segundos.')
    throw new Falha(503, 'indisponivel', INDISPONIVEL)
  }

  const escolha = data?.choices?.[0]
  const texto = (escolha?.message?.content || '').trim()
  if (!texto) {
    if (escolha?.finish_reason === 'length') {
      throw new Falha(422, 'invalido', 'A resposta ficou longa demais. Tente perguntar de forma mais específica.')
    }
    throw new Falha(503, 'indisponivel', 'Não consegui responder agora. Tente novamente.')
  }
  return texto
}

/* ── Google Gemini (reserva) ── */
async function viaGemini(env, cfg, sistema, historico) {
  const body = {
    systemInstruction: { parts: [{ text: sistema }] },
    contents: historico.map(m => ({
      // O Gemini usa 'model' onde o padrão OpenAI usa 'assistant'.
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      maxOutputTokens: cfg.maxTokens,
      temperature: cfg.temperature,
      ...(cfg.json ? { responseMimeType: 'application/json' } : {}),
    },
  }

  let res
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.gemini}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    })
  } catch (e) {
    console.error('gemini fora do ar:', e?.message)
    throw new Falha(503, 'indisponivel', INDISPONIVEL)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('gemini', res.status, data?.error?.message)
    throw new Falha(503, 'indisponivel', INDISPONIVEL)
  }

  const candidate = data?.candidates?.[0]
  const texto = (candidate?.content?.parts || [])
    .filter(p => !p.thought)          // descarta o raciocínio interno
    .map(p => p.text)
    .filter(Boolean)
    .join('')
    .trim()

  if (!texto) {
    if (candidate?.finishReason === 'SAFETY') {
      throw new Falha(422, 'invalido', 'A IA não pôde responder isso. Reformule a pergunta.')
    }
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Falha(422, 'invalido', 'A resposta ficou longa demais. Tente perguntar de forma mais específica.')
    }
    throw new Falha(503, 'indisponivel', 'Não consegui responder agora. Tente novamente.')
  }
  return texto
}
