/**
 * ai.js - acesso à IA do Avante.
 *
 * Dois provedores, a MESMA interface. A escolha é pela chave presente:
 *   VITE_GROQ_KEY   → Groq (llama-3.3-70b). Preferido: roda em hardware
 *                     de inferência dedicado e responde em fração do
 *                     tempo do Gemini. Era o provedor original do app.
 *   VITE_GEMINI_KEY → Google Gemini. Reserva, usado quando não há Groq.
 *
 * Só a camada de transporte muda entre os dois: prompts, modos e o
 * formato ({ mode, messages, context }) são compartilhados, então
 * trocar de provedor não mexe em nenhuma tela.
 *
 * ⚠️ A chamada é feita DIRETO do navegador porque o projeto está no
 * plano Spark, que não permite Cloud Functions. A chave vai no bundle e
 * é extraível. Para conter o risco é OBRIGATÓRIO, no painel do
 * provedor: restringir por referrer/origem, limitar à API de inferência
 * e definir teto de cota.
 */

import { mapaParaPrompt } from './appMap'

const GROQ_KEY = import.meta.env.VITE_GROQ_KEY
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY

/** Provedor ativo. Groq ganha quando as duas chaves existem. */
export const PROVEDOR = GROQ_KEY ? 'groq' : GEMINI_KEY ? 'gemini' : null

export const NO_KEY_MESSAGE =
  'IA não configurada. Adicione VITE_GROQ_KEY (ou VITE_GEMINI_KEY) no .env.local.'

export function hasAI() {
  return !!PROVEDOR
}

/** Neutraliza quebras e caracteres de controle vindos de dados do app,
 *  para que contexto não vire injeção de prompt. */
function clean(value, max = 120) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/**
 * Instruções de guia do app, iguais para cliente e veterinário.
 *
 * O mapa vem de appMap.js e é a ÚNICA fonte sobre o que existe no app.
 * A regra de não inventar caminho é o ponto todo: uma IA que responde
 * "vá em Configurações > Notificações" numa tela que não existe é pior
 * do que uma IA que admite não saber.
 */
function guiaDoApp(papel) {
  return `

COMO GUIA DO APP:
Quando a pergunta for sobre USAR o app (onde fica, como faço, não estou achando),
responda com o passo a passo da lista abaixo e termine com o marcador [IR:chave]
da tela correspondente. O app transforma esse marcador num botão que leva a pessoa
até lá e acende o elemento na tela.

Telas que existem:
${mapaParaPrompt(papel)}

REGRAS DO GUIA:
- Use SOMENTE as chaves da lista. Nunca invente tela, botão ou caminho.
- Se o que pedirem não estiver na lista, diga que essa função não existe no app
  hoje e ofereça o mais próximo. Nunca descreva um caminho que você não viu aqui.
- Um [IR:chave] por resposta, no fim, e só quando houver uma tela para mostrar.
- Quando usar [IR:chave], responda em NO MÁXIMO uma frase curta e NÃO repita os
  passos: o app já mostra o caminho numerado logo abaixo da sua resposta.
  Repetir os passos deixa a mesma informação duas vezes na tela.
- Escreva em texto puro. Nada de asteriscos, markdown, negrito ou listas
  numeradas: o app mostra o texto exatamente como você escrever.`
}

/* ── Prompts de sistema ─────────────────────────────────────────── */
function clientPrompt(ctx) {
  const vets = Array.isArray(ctx.vets) ? ctx.vets.slice(0, 4) : []
  const list = vets.length
    ? `\n\nVeterinários disponíveis:\n${vets
        .map(v => `- ${clean(v.name, 60)}${v.featured ? ' ⭐ Destaque' : ''}${v.online ? ' 🟢' : ''}: ${clean(v.specialties, 80)}`)
        .join('\n')}`
    : ''

  return `Você é a triagem do AvanteApp (veterinária a domicílio, Brasil).

REGRAS:
- Máx 2-3 frases curtas. Direto e prático.
- Dúvidas gerais (vacinas, alimentação, comportamento, rotina): responda direto, SEM sugerir agendamento.
- Você NÃO diagnostica e NÃO substitui exame presencial. Sempre que a pergunta
  envolver sintoma, dor, ferida, comportamento estranho ou remédio, feche a
  resposta lembrando que só um veterinário confirma olhando o animal.
- Nunca afirme causa como certeza. Use "pode ser", "é comum nesses casos".
- Nunca indique dose nem nome de medicamento para o tutor dar por conta.
- Sintomas físicos agudos, dor, ferida, emergência, piora repentina, ou pedido de agendamento: oriente e inclua [SUGGEST_BOOKING] no fim.
- NUNCA cite um veterinário pelo nome quando houver mais de um disponível. O app já mostra a lista logo abaixo da sua resposta, então apenas convide a pessoa a escolher entre os profissionais sugeridos.
- Só cite um nome se houver EXATAMENTE UM veterinário na lista.
- PROIBIDO: "é fundamental que", "é importante que", discursos longos.
- Nunca use travessão (-) na resposta. Prefira vírgula, dois-pontos ou frases separadas.
- Responda em português informal.
- Dúvida sobre COMO USAR o app: responda pelo guia abaixo, sem sugerir agendamento.${list}${guiaDoApp('client')}`
}

function vetPrompt(ctx) {
  const areas = ctx.specialties ? `\nÁreas de atuação do profissional: ${clean(ctx.specialties, 200)}.` : ''
  const agenda = Number(ctx.todayCount) > 0
    ? `\nHoje ele tem ${Math.min(Number(ctx.todayCount), 99)} atendimento(s) em andamento ou agendado(s).`
    : ''

  return `Você é copiloto clínico de um MÉDICO VETERINÁRIO brasileiro dentro do app AVANTE.
Seu interlocutor é um profissional formado. Fale tecnicamente, sem simplificar como faria para um tutor.${areas}${agenda}

REGRAS:
- Seja direto e objetivo. Use listas curtas quando ajudar.
- Doses: sempre em mg/kg, com via, intervalo e duração. Diga a espécie a que se aplica.
- Aponte contraindicações e interações relevantes quando houver risco real.
- Diagnóstico diferencial: liste as hipóteses mais prováveis primeiro e diga qual exame diferencia cada uma.
- Se faltar dado essencial (peso, espécie, idade), PERGUNTE antes de responder.
- Nunca invente valores. Se não tiver certeza de uma dose, diga que precisa ser confirmada em bula/formulário.
- Feche respostas com doses ou protocolos com: "Confira sempre a bula e o seu julgamento clínico."
- Nunca apresente dose, diagnóstico ou protocolo como certeza. Você é apoio de
  consulta, sujeito a erro: a decisão e a responsabilidade são do profissional.
- Nunca use travessão (-) na resposta. Prefira vírgula, dois-pontos ou frases separadas.
- Responda em português técnico do Brasil.
- Dúvida sobre COMO USAR o app (e não sobre clínica): responda pelo guia abaixo.${guiaDoApp('vet')}`
}

const TRIAGE_PROMPT = `Você é um assistente de triagem veterinária. Responda SEMPRE em JSON válido com os campos:
- urgency: "imediata" | "alta" | "media" | "baixa"
- specialty: especialidade veterinária mais adequada (1-3 palavras)
- summary: resumo clínico em 1 frase para o veterinário
- advice: orientação breve para o tutor enquanto aguarda (1-2 frases)
Responda APENAS o JSON, sem markdown.`


/* ── Tarefas de um clique ("Usar IA") ────────────────────────────
   Diferente do chat: entra dado do app, sai uma sugestão pronta que a
   pessoa aceita ou descarta. Nada é gravado sem confirmação - a IA
   preenche o formulário, quem decide é o profissional. */

function orcamentoPrompt(ctx) {
  return `Você monta orçamentos para um MÉDICO VETERINÁRIO brasileiro que atende a domicílio.

Atendimento:
- Serviço solicitado: ${clean(ctx.servico, 120) || 'não informado'}
- Animal: ${clean(ctx.animal, 80) || 'não informado'}
- Relato do tutor: ${clean(ctx.descricao, 400) || 'não informado'}
- Cidade: ${clean(ctx.cidade, 60) || 'não informada'}

Responda em JSON válido:
{"items":[{"desc":"...","qty":1,"price":0}],"observacao":"..."}

REGRAS:
- 2 a 5 itens. Inclua a taxa de deslocamento quando fizer sentido para atendimento domiciliar.
- O campo price e o valor UNITARIO em reais, numero puro (sem cifrao, sem texto).
- Pratique valores medianos do mercado brasileiro de 2025 para atendimento domiciliar.
- O campo desc e curto e concreto: Consulta domiciliar, Aplicacao de vacina V10.
- O campo observacao traz 1 frase lembrando que os valores sao uma sugestao a conferir.
- Nunca invente procedimento que o relato não sustenta.
- Responda APENAS o JSON.`
}

function descricaoPrompt() {
  return `Você organiza o relato de um tutor brasileiro para um veterinário entender rápido.

Reescreva o texto do tutor deixando claro, nesta ordem, o que ele tiver dito:
o que está acontecendo, desde quando, se piorou, e o que já foi feito.

REGRAS:
- Use o MENOR número de frases possível: no máximo 3, e uma só já basta
  quando o tutor contou pouco. É proibido alongar o texto para parecer
  mais completo. Frase que não carrega fato novo deve ser cortada.
- Use SOMENTE o que o tutor disse. Nunca invente sintoma, prazo ou diagnóstico.
- Se faltar tempo de duração, não invente, apenas omita.
- NUNCA afirme ausência de algo que o tutor não mencionou. Se ele não disse
  o que já fez, não escreva "nada foi feito"; simplesmente não cite o assunto.
  O mesmo vale para melhora, piora e sintomas não relatados.
- Não diagnostique e não recomende tratamento. Só organize o relato.
- Nunca use travessão (-) no texto. Prefira vírgula, dois-pontos ou frases separadas.
- Responda apenas o texto reescrito, sem aspas e sem comentários.`
}

function resumoProntuarioPrompt(ctx) {
  return `Você resume o histórico clínico de um animal para o veterinário ler antes do atendimento.

Animal: ${clean(ctx.animal, 80) || 'não informado'}

REGRAS:
- Máximo 4 linhas. Português técnico do Brasil.
- Destaque nesta ordem: condições crônicas, alergias, cirurgias, vacinas em atraso, tendência do peso.
- Use SOMENTE o que estiver no histórico. Não complete lacunas com suposição.
- Se o histórico estiver vazio ou for insuficiente, responda exatamente: "Histórico ainda sem registros suficientes."
- Sem saudação, sem introdução. Comece direto pelo conteúdo.`
}

/**
 * Modelo por modo, escolhido medindo latência real.
 *
 * O raciocínio do Gemini 3.x é caro em tempo: no copiloto clínico ele
 * levava 32s por resposta - a ponto de parecer que a IA estava fora do
 * ar. Desligado, o mesmo modelo responde em ~4,7s com a mesma estrutura
 * (dose, via, intervalo, duração). O cliente usa o modelo mais leve
 * porque as respostas são curtas: ~1s.
 */
/**
 * Um modelo por provedor, por modo.
 *
 * `groq` responde em fração do tempo do Gemini porque roda em hardware
 * de inferência dedicado - foi por isso que o app começou nele. O modelo
 * original (llama-3.3-70b) foi aposentado; gpt-oss-120b o substitui,
 * medido em ~0,5s na descrição e ~1,0s no orçamento.
 *
 * No Gemini, o raciocínio do 3.x é caro em tempo: no copiloto clínico
 * levava 32s por resposta, a ponto de parecer fora do ar. Desligado, o
 * mesmo modelo responde em ~4,7s com a mesma estrutura.
 */
const MODES = {
  client: { build: clientPrompt, groq: 'openai/gpt-oss-120b', gemini: 'gemini-3.1-flash-lite', maxTokens: 500, temperature: 0.4, json: false },
  vet:    { build: vetPrompt,    groq: 'openai/gpt-oss-120b', gemini: 'gemini-3.5-flash-lite', maxTokens: 900, temperature: 0.3, json: false },
  triage: { build: () => TRIAGE_PROMPT, groq: 'openai/gpt-oss-120b', gemini: 'gemini-3.1-flash-lite', maxTokens: 600, temperature: 0.3, json: true },

  // Tarefas de um clique. Temperatura baixa: aqui não se quer criatividade,
  // quer-se a mesma sugestão para a mesma entrada.
  orcamento: { build: orcamentoPrompt,        groq: 'openai/gpt-oss-120b', gemini: 'gemini-3.1-flash-lite', maxTokens: 500, temperature: 0.2, json: true },
  descricao: { build: descricaoPrompt,        groq: 'openai/gpt-oss-120b', gemini: 'gemini-3.1-flash-lite', maxTokens: 300, temperature: 0.2, json: false },
  prontuario:{ build: resumoProntuarioPrompt, groq: 'openai/gpt-oss-120b', gemini: 'gemini-3.1-flash-lite', maxTokens: 400, temperature: 0.2, json: false },
}


/**
 * Pergunta à IA pelo provedor ativo.
 *
 * @param {object} opts
 * @param {'client'|'vet'|'triage'|'orcamento'|'descricao'|'prontuario'} opts.mode
 * @param {Array}  opts.messages   [{ role: 'user'|'assistant', content }]
 * @param {object} [opts.context]  Dados do prompt (lista de vets, especialidades…).
 * @returns {Promise<string>}
 */
export async function askAI({ mode, messages, context }) {
  if (!PROVEDOR) throw new Error(NO_KEY_MESSAGE)

  const cfg = MODES[mode]
  if (!cfg) throw new Error('Modo de IA inválido.')

  const historico = messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 1500),
  }))
  const sistema = cfg.build(context || {})

  return PROVEDOR === 'groq'
    ? viaGroq(cfg, sistema, historico)
    : viaGemini(cfg, sistema, historico)
}

/* ── Groq (API compatível com OpenAI) ───────────────────────────── */
async function viaGroq(cfg, sistema, historico) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: cfg.groq,
      max_tokens: cfg.maxTokens,
      temperature: cfg.temperature,
      ...(cfg.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: sistema }, ...historico],
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('Groq error', res.status, data?.error?.message)
    // 429 é cota estourada - vale dizer, porque a saída é esperar.
    if (res.status === 429) throw new Error('Muitas perguntas seguidas. Espere alguns segundos.')
    throw new Error('Assistente indisponível no momento. Tente novamente.')
  }

  const escolha = data?.choices?.[0]
  const texto = (escolha?.message?.content || '').trim()
  if (!texto) {
    if (escolha?.finish_reason === 'length') {
      throw new Error('A resposta ficou longa demais. Tente perguntar de forma mais específica.')
    }
    throw new Error('Não consegui responder agora. Tente novamente.')
  }
  return texto
}

/* ── Google Gemini ──────────────────────────────────────────────── */
async function viaGemini(cfg, sistema, historico) {
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.gemini}:generateContent?key=${GEMINI_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('Gemini error', res.status, data?.error?.message)
    throw new Error('Assistente indisponível no momento. Tente novamente.')
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
      throw new Error('A IA não pôde responder isso. Reformule a pergunta.')
    }
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error('A resposta ficou longa demais. Tente perguntar de forma mais específica.')
    }
    throw new Error('Não consegui responder agora. Tente novamente.')
  }
  return texto
}

/** Igual a askAI, mas já devolve o JSON desserializado. */
export async function askAIJSON(opts) {
  const raw = await askAI(opts)
  try {
    return JSON.parse(raw)
  } catch {
    // Alguns modelos ainda cercam com ```json - limpa e tenta de novo.
    return JSON.parse(raw.replace(/```json?/gi, '').replace(/```/g, '').trim())
  }
}
