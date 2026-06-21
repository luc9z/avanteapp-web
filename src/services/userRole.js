/**
 * userRole.js — Resolução do papel do usuário (cliente | profissional).
 * Antes esta lógica existia duplicada (3 buscas em cascata) em
 * SplashPage e LoginPage. Agora há uma única implementação, com
 * cache em memória por sessão para evitar leituras repetidas.
 */
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'

export const ROLES = {
  PROFESSIONAL: 'medico_veterinario',
  CLIENT: 'client',
}

export const HOME_BY_ROLE = {
  [ROLES.PROFESSIONAL]: '/dashboard',
  [ROLES.CLIENT]: '/home',
}

const roleCache = new Map()

export function clearRoleCache(uid) {
  if (uid) roleCache.delete(uid)
  else roleCache.clear()
}

/**
 * Retorna 'medico_veterinario' | 'client' | null (sem perfil definido).
 * Procura primeiro em users/{uid}, depois no legado professionals/{uid}.
 */
export async function resolveUserRole(uid) {
  if (!uid) return null
  if (roleCache.has(uid)) return roleCache.get(uid)

  let role = null
  try {
    const userDoc = await getDoc(doc(db, 'users', uid))
    const p = userDoc.exists() ? userDoc.data()?.profession : null
    if (p === ROLES.PROFESSIONAL || p === ROLES.CLIENT) role = p

    if (!role) {
      // Coleção legada de versões anteriores do app
      const profDoc = await getDoc(doc(db, 'professionals', uid))
      const lp = profDoc.exists() ? profDoc.data()?.profession : null
      if (lp === ROLES.PROFESSIONAL || lp === ROLES.CLIENT) role = lp
    }
  } catch (e) {
    if (import.meta.env.DEV) console.error('resolveUserRole:', e)
    return null // não cacheia falha de rede
  }

  if (role) roleCache.set(uid, role)
  return role
}

/** Rota inicial adequada ao papel; /user-type quando ainda não definido. */
export async function resolveHomeRoute(uid) {
  const role = await resolveUserRole(uid)
  return HOME_BY_ROLE[role] || '/user-type'
}
