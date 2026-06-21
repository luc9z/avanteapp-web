/**
 * RequireRole — Guarda de rota por papel.
 * Antes, qualquer usuário logado acessava /dashboard, /reports etc.
 * mesmo sendo cliente (e vice-versa). A barreira definitiva é o
 * firestore.rules, mas este guard evita telas quebradas e fluxos
 * confusos no frontend.
 */
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
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
  const { user, loading } = useAuth()
  const [resolved, setResolved] = useState(null) // null = resolvendo

  const expected = role === 'professional' ? ROLES.PROFESSIONAL
    : role === 'client' ? ROLES.CLIENT
    : null

  useEffect(() => {
    let cancelled = false
    if (!user?.uid || !expected) return
    resolveUserRole(user.uid).then(r => { if (!cancelled) setResolved(r ?? 'none') })
    return () => { cancelled = true }
  }, [user?.uid, expected])

  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (!expected) return children

  if (resolved === null) return <FullPageSpinner />
  if (resolved === 'none') return <Navigate to="/user-type" replace />
  if (resolved !== expected) return <Navigate to={HOME_BY_ROLE[resolved] || '/user-type'} replace />

  return children
}
