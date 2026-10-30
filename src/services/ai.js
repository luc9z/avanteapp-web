/**
 * ai.js - acesso à IA do Avante.
 *
 * A IA roda no servidor do AVANTE (worker/src/ia.js): a chave da Groq (ou
 * do Gemini) fica lá, como segredo, e nunca vai para o navegador. Antes a
 * chamada era feita direto daqui e a chave ia dentro do app publicado.
 *
 * O app manda só o modo, as mensagens e o contexto; o prompt de sistema é
 * montado no servidor (src/services/aiPrompts.js), e cada conta tem um
 * limite diário de perguntas.
 */

import { chamarServidor, servidorConfigurado } from './servidor'

export const NO_KEY_MESSAGE = 'O assistente está indisponível no momento. Tente mais tarde.'

export function hasAI() {
  return servidorConfigurado()
}

/**
 * Pergunta à IA.
 *
 * @param {object} opts
 * @param {'client'|'vet'|'triage'|'orcamento'|'descricao'|'prontuario'} opts.mode
 * @param {Array}  opts.messages   [{ role: 'user'|'assistant', content }]
 * @param {object} [opts.context]  Dados do prompt (lista de vets, especialidades…).
 * @returns {Promise<string>}
 */
export async function askAI({ mode, messages, context }) {
  const historico = (messages || []).slice(-12).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 1500),
  }))
  // A mensagem do servidor já é a que a pessoa deve ver (limite, fora do ar…)
  const { texto } = await chamarServidor('/ia', { mode, messages: historico, context: context || {} })
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
