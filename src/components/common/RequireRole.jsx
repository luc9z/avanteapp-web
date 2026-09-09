/**
 * RequireRole - Guarda de rota por papel.
 * Antes, qualquer usuário logado acessava /dashboard, /reports etc.
 * mesmo sendo cliente (e vice-versa). A barreira definitiva é o
 * firestore.rules, mas este guard evita telas quebradas e fluxos
 * confusos no frontend.
 */
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { resolveUserRole, ROLES, HOME_BY_ROLE } from '../../services/userRole'
import Spinner from './Spinner'

function FullPageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner size={32} color="#375337" />
    </div>
  )
}

/**
 * role: 'professional' | 'client' | undefined (apenas autenticação)
 */
export default function RequireRole({ role, children }) {
  const { user, loading, logout } = useAuth()
  const [resolved, setResolved] = useState(null) // null = resolvendo
  const [disabled, setDisabled] = useState(false)

  const expected = role === 'professional' ? ROLES.PROFESSIONAL
    : role === 'client' ? ROLES.CLIENT
    : null

  useEffect(() => {
    let cancelled = false
    if (!user?.uid || !expected) return
    resolveUserRole(user.uid).then(r => { if (!cancelled) setResolved(r ?? 'none') })
    return () => { cancelled = true }
  }, [user?.uid, expected])

  // Conta desativada pelo admin: acompanha em tempo real, então a
  // desativação vale mesmo com a sessão já aberta.
  useEffect(() => {
    if (!user?.uid) return
    return onSnapshot(doc(db, 'users', user.uid),
      snap => setDisabled(snap.data()?.disabled === true),
      () => {})
  }, [user?.uid])

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />

  if (disabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center gap-3">
        <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
        <p className="font-bold text-gray-800">Conta desativada</p>
        <p className="text-sm text-gray-500 max-w-sm">
          Esta conta foi desativada. Fale com o suporte se acredita que houve um engano.
        </p>
        <button onClick={logout} className="btn-primary px-6 mt-2">Sair</button>
      </div>
    )
  }

  if (!expected) return children

  if (resolved === null) return <FullPageSpinner />
  if (resolved === 'none') return <Navigate to="/user-type" replace />
  if (resolved !== expected) return <Navigate to={HOME_BY_ROLE[resolved] || '/user-type'} replace />

  return children
}
