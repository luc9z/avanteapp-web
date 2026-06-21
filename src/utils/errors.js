/**
 * errors.js — Mensagens de erro amigáveis.
 * Antes o app exibia `e.message` cru em toasts ("Erro: Missing or
 * insufficient permissions"), o que vaza detalhes internos e parece
 * quebrado para o usuário. Aqui os erros do Firebase são traduzidos
 * e o detalhe técnico vai apenas para o console (dev).
 */

const FIRESTORE_ERRORS = {
  'permission-denied': 'Você não tem permissão para esta ação.',
  'unavailable': 'Sem conexão com o servidor. Verifique sua internet.',
  'not-found': 'Registro não encontrado.',
  'deadline-exceeded': 'A operação demorou demais. Tente novamente.',
  'resource-exhausted': 'Limite de uso atingido. Tente mais tarde.',
  'unauthenticated': 'Sua sessão expirou. Faça login novamente.',
}

export function friendlyError(e, fallback = 'Algo deu errado. Tente novamente.') {
  if (import.meta.env.DEV) console.error(e)
  const code = e?.code || ''
  return FIRESTORE_ERRORS[code] || fallback
}
