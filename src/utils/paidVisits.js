/**
 * paidVisits — conta os atendimentos pagos que vieram pelo app, sem servidor
 * (o projeto roda no plano gratuito do Firebase, sem Cloud Functions).
 *
 * Conta uma solicitação quando: está finalizada, o vet marcou "Recebi o
 * pagamento" e o cliente confirmou o atendimento (ou não respondeu em 48h,
 * como a tela de confirmação promete).
 */
export const FUNDADOR_TRIAL_VISITS = 3
export const FUNDADOR_PRICE = 29.9
export const FUNDADOR_SLOTS = 30

const AUTO_CONFIRM_MS = 48 * 60 * 60 * 1000

function toMillis(ts) {
  if (!ts) return null
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  const t = new Date(ts).getTime()
  return Number.isNaN(t) ? null : t
}

export function isPaidVisit(r, now = Date.now()) {
  if ((r?.status || '').toLowerCase() !== 'finalizado') return false
  if (r.paymentReceived !== true) return false
  if (r.confirmFinish_client === true) return true
  const finalizedAt = toMillis(r.finalizedAt)
  return finalizedAt != null && now - finalizedAt >= AUTO_CONFIRM_MS
}

export function countPaidVisits(requests, now = Date.now()) {
  return (requests || []).filter(r => isPaidVisit(r, now)).length
}
