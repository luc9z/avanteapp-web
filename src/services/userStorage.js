/**
 * userStorage - dados locais amarrados à conta.
 *
 * Existe porque chaves globais no localStorage vazavam entre contas:
 * ao trocar de usuário no mesmo navegador, a conversa da IA (que inclui
 * dados de saúde do animal) e o estado dos tutoriais do usuário anterior
 * continuavam visíveis para o novo.
 *
 * Duas camadas de proteção:
 *  1. a chave carrega o uid, então um usuário nunca lê o dado do outro;
 *  2. `clearUserStorage()` apaga tudo no logout, para não deixar rastro
 *     em computador compartilhado.
 *
 * O tema é preferência do aparelho, não da conta - fica de fora.
 */

/**
 * Só o conteúdo sensível some no logout.
 *
 * As conversas com a IA carregam sintomas e dados de saúde - não podem
 * ficar num computador compartilhado. Já progresso de tutorial, tema e
 * avisos dispensados são preferências: apagá-los faria o app tratar
 * quem volta como se fosse a primeira vez.
 *
 * O isolamento entre contas não depende desta limpeza: as chaves já
 * carregam o uid. Isto aqui é só a segunda camada.
 */
const SENSIVEL = ['avante-ai-chat', 'avante-vet-chat', 'avante-ai-cache']

/** Chave escopada: `avante-ai-chat` + uid. Sem uid, não persiste nada. */
export function userKey(base, uid) {
  return uid ? `${base}:${uid}` : null
}

export function readUser(base, uid) {
  const k = userKey(base, uid)
  if (!k) return null
  try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null }
}

export function writeUser(base, uid, value) {
  const k = userKey(base, uid)
  if (!k) return
  try { localStorage.setItem(k, JSON.stringify(value)) } catch { /* storage indisponível */ }
}

export function removeUser(base, uid) {
  const k = userKey(base, uid)
  if (!k) return
  try { localStorage.removeItem(k) } catch { /* storage indisponível */ }
}

/**
 * Apaga do aparelho as conversas com a IA ao sair da conta.
 * Pega tanto as chaves escopadas (`base:uid`) quanto as antigas sem uid,
 * que ficaram de versões anteriores do app.
 */
export function clearUserStorage() {
  try {
    const remover = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (SENSIVEL.some(base => k === base || k.startsWith(`${base}:`))) remover.push(k)
    }
    remover.forEach(k => localStorage.removeItem(k))
  } catch { /* storage indisponível */ }
}
