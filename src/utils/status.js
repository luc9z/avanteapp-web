/**
 * status.js — Fonte única de verdade para status de solicitações.
 * Substitui as 4 implementações duplicadas de normalizeStatus que
 * existiam em ClientHomePage, ClientRequestsPage, AgendaPage e Dashboard.
 */

const STATUS_ALIASES = {
  pendente: ['pending', 'pendente'],
  aceito: ['accepted', 'aceito', 'confirmed', 'confirmado'],
  rejeitado: ['rejected', 'rejeitado', 'cancelled', 'cancelado', 'canceled'],
  finalizado: ['done', 'finalizado', 'completed', 'concluido'],
  em_andamento: ['em_andamento', 'in_progress', 'andamento'],
  a_caminho: ['a_caminho', 'on_the_way'],
  pausado: ['pausado', 'paused'],
  aguardando: ['aguardando_cliente', 'awaiting_client', 'aguardando_confirmacao'],
}

const ALIAS_LOOKUP = Object.entries(STATUS_ALIASES).reduce((acc, [canonical, aliases]) => {
  aliases.forEach(a => { acc[a] = canonical })
  return acc
}, {})

/** Normaliza qualquer variação de status para a forma canônica em pt-BR. */
export function normalizeStatus(s) {
  const v = (s || '').toLowerCase().trim()
  return ALIAS_LOOKUP[v] || v || 'pendente'
}

/** Status em que existe um atendimento ativo entre cliente e profissional. */
export const ACTIVE_STATUSES = ['aceito', 'a_caminho', 'em_andamento', 'pausado']

/** Status finais que aguardam ação do cliente (confirmar/avaliar). */
export const FINAL_STATUSES = ['finalizado']

export function isPending(s) { return normalizeStatus(s) === 'pendente' }
export function isActive(s) { return ACTIVE_STATUSES.includes(normalizeStatus(s)) }
export function isFinal(s) { return FINAL_STATUSES.includes(normalizeStatus(s)) }
export function isRejected(s) { return normalizeStatus(s) === 'rejeitado' }

/** Labels e classes de badge por status canônico. */
export const STATUS_INFO = {
  pendente:     { label: 'Pendente',               cls: 'badge-pending' },
  aceito:       { label: 'Aceito',                 cls: 'badge-accepted' },
  a_caminho:    { label: 'A caminho',              cls: 'badge-on-way' },
  em_andamento: { label: 'Em andamento',           cls: 'badge-in-progress' },
  pausado:      { label: 'Em pausa',               cls: 'badge-paused' },
  aguardando:   { label: 'Aguardando confirmação', cls: 'badge-paused' },
  rejeitado:    { label: 'Recusado',               cls: 'badge-rejected' },
  finalizado:   { label: 'Finalizado',             cls: 'badge-done' },
}

export function statusInfo(s) {
  return STATUS_INFO[normalizeStatus(s)] || { label: s || '—', cls: 'badge-done' }
}
