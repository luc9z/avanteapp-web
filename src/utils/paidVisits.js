/**
 * paidVisits - quantos atendimentos o Vet Fundador já concluiu pelo app.
 *
 * Aqui é só para MOSTRAR o progresso na hora. Quem decide o fim do período
 * grátis é o servidor (tarefa diária do Worker), com a mesma regra de
 * functions/pagamentos.js (atendimentoConta). Os números abaixo também
 * precisam bater com FUNDADOR de lá: npm run test:pagamentos confere.
 *
 * Conta quando o atendimento está finalizado e o CLIENTE confirmou (ou não
 * respondeu em 48h). A marca "Recebi o pagamento" do vet não entra: no
 * período grátis, ele ganharia deixando de marcar.
 */
export const FUNDADOR_TRIAL_VISITS = 3
export const FUNDADOR_PRICE = 29.9
export const FUNDADOR_SLOTS = 30

const AUTO_CONFIRM_MS = 48 * 60 * 60 * 1000
const FINALIZADO = ['finalizado', 'done', 'completed', 'concluido']

function toMillis(ts) {
  if (!ts) return null
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  const t = new Date(ts).getTime()
  return Number.isNaN(t) ? null : t
}

export function isPaidVisit(r, now = Date.now(), since = null) {
  if (!FINALIZADO.includes((r?.status || '').toLowerCase())) return false
  const finalizedAt = toMillis(r.finalizedAt)
  // Só conta o que foi concluído depois de entrar no Vet Fundador.
  const start = toMillis(since)
  if (start != null && (toMillis(r.finalizedAt || r.createdAt) ?? -Infinity) < start) return false
  if (r.confirmFinish_client === true) return true
  return finalizedAt != null && now - finalizedAt >= AUTO_CONFIRM_MS
}

export function countPaidVisits(requests, now = Date.now(), since = null) {
  return (requests || []).filter(r => isPaidVisit(r, now, since)).length
}
