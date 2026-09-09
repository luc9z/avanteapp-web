/**
 * perfis.js - foto e nome de outra pessoa, pelo uid.
 *
 * A solicitação guarda só o NOME de quem atende, não a foto. Mostrar o
 * rosto do veterinário na lista de pedidos muda muito o reconhecimento
 * - o tutor lembra da cara de quem foi na casa dele, não do nome
 * completo - mas isso exige buscar o perfil.
 *
 * O cache por sessão evita repetir a leitura: a mesma lista costuma ter
 * vários pedidos do mesmo profissional, e rolar a tela não deve custar
 * leitura nova.
 */
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

/** uid -> { name, photoURL }. Vive enquanto a aba estiver aberta. */
const cache = new Map()
/** Buscas em andamento, para não pedir o mesmo uid duas vezes. */
const emVoo = new Map()

export function limparPerfis() {
  cache.clear()
  emVoo.clear()
}

/** Um perfil. Devolve null se não der para ler (sem permissão, sem rede). */
export async function carregarPerfil(uid) {
  if (!uid) return null
  if (cache.has(uid)) return cache.get(uid)
  if (emVoo.has(uid)) return emVoo.get(uid)

  const p = getDoc(doc(db, 'users', uid))
    .then(snap => {
      const d = snap.exists() ? snap.data() : null
      const perfil = d ? { name: d.name || '', photoURL: d.photoURL || '' } : null
      cache.set(uid, perfil)
      emVoo.delete(uid)
      return perfil
    })
    .catch(e => {
      // Sem perfil o cartão cai na inicial do nome, que já é suficiente.
      if (import.meta.env.DEV) console.error('[perfis]', uid, e)
      emVoo.delete(uid)
      return null
    })

  emVoo.set(uid, p)
  return p
}

/**
 * Vários de uma vez, sem repetir uid.
 * @returns {Promise<Record<string, {name: string, photoURL: string}>>}
 */
export async function carregarPerfis(uids) {
  const unicos = [...new Set((uids || []).filter(Boolean))]
  if (!unicos.length) return {}
  const perfis = await Promise.all(unicos.map(carregarPerfil))
  return Object.fromEntries(
    unicos.map((uid, i) => [uid, perfis[i]]).filter(([, p]) => p),
  )
}
