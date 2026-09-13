/**
 * status.js - Fonte única de verdade para status de solicitações.
 * Substitui as 4 implementações duplicadas de normalizeStatus que
 * existiam em ClientHomePage, ClientRequestsPage, AgendaPage e Dashboard.
 */

export const STATUS_ALIASES = {
  pendente: ['pending', 'pendente'],
  aceito: ['accepted', 'aceito', 'confirmed', 'confirmado'],
  rejeitado: ['rejected', 'rejeitado', 'cancelled', 'cancelado', 'canceled'],
  finalizado: ['done', 'finalizado', 'completed', 'concluido'],
  em_andamento: ['em_andamento', 'in_progress', 'andamento'],
  a_caminho: ['a_caminho', 'on_the_way'],
  pausado: ['pausado', 'paused'],
  aguardando: ['aguardando_cliente', 'awaiting_client', 'aguardando_confirmacao'],
  orcamento: ['aguardando_orcamento', 'orcamento', 'quote_pending'],
  orcamento_recusado: ['orcamento_recusado', 'quote_rejected'],
  urgente: ['urgente', 'urgent'],
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
export const ACTIVE_STATUSES = ['aceito', 'a_caminho', 'em_andamento', 'pausado', 'orcamento', 'orcamento_recusado']

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
  orcamento:    { label: 'Orçamento enviado',      cls: 'badge-pending' },
  orcamento_recusado: { label: 'Orçamento recusado', cls: 'badge-rejected' },
  urgente:      { label: 'Urgente',                cls: 'badge-rejected' },
  rejeitado:    { label: 'Recusado',               cls: 'badge-rejected' },
  finalizado:   { label: 'Finalizado',             cls: 'badge-done' },
}

/**
 * O pedido espera uma AÇÃO do cliente agora?
 *
 * É o que o contador da aba "Pedidos" mostra. Antes ele somava também os
 * pedidos "em andamento", que não pedem nada de ninguém - o número
 * aparecia sem que houvesse o que fazer, e não havia como descobrir a
 * qual pedido ele se referia.
 *
 * São dois casos, os mesmos que já viram cartão em "Atualizações":
 *  - orçamento recebido, esperando aprovar ou recusar;
 *  - atendimento finalizado, esperando confirmação e avaliação.
 */
export function precisaDoCliente(r) {
  const st = normalizeStatus(r?.status)
  // Recusado o orçamento, quem deve agir é o veterinário - o cliente
  // já respondeu e não tem nada a fazer até chegar proposta nova.
  if (st === 'orcamento') return true
  if (st === 'finalizado') return r?.rated !== true
  return false
}

/**
 * A frase que explica a pendência, para o cartão do pedido dizer o que
 * a pessoa precisa fazer - não só que "tem algo".
 * Devolve null quando nada é esperado do cliente.
 */
export function acaoDoCliente(r) {
  const st = normalizeStatus(r?.status)
  if (st === 'orcamento') return 'Orçamento recebido, aprove ou recuse'
  if (st === 'orcamento_recusado') return null
  if (st === 'finalizado' && r?.rated !== true) {
    return r?.confirmFinish_client === true
      ? 'Avalie o atendimento'
      : 'Confirme que o atendimento foi concluído'
  }
  return null
}

export function statusInfo(s) {
  const conhecido = STATUS_INFO[normalizeStatus(s)]
  if (conhecido) return conhecido
  // Status gravado por uma versão que este app não conhece. Avisa no
  // console para virar entrada nova aqui, e NUNCA devolve a chave: o
  // usuário não tem por que ler nome de campo de banco.
  if (s && import.meta.env?.DEV) console.warn('[status] sem rótulo:', s)
  return { label: 'Situação não reconhecida', cls: 'badge-done' }
}
