import { useNavigate } from 'react-router-dom'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { clearRoleCache } from '../../services/userRole'
import { friendlyError } from '../../utils/errors'
import { showToast } from '../../components/common/Toast'
import { useState } from 'react'
import Spinner from '../../components/common/Spinner'

export default function UserTypePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  async function setAsClient() {
    if (!user) return
    setLoading(true)
    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        profession: 'client',
        updatedAt: serverTimestamp(),
      }, { merge: true })
      clearRoleCache(user.uid)
      navigate('/home', { replace: true })
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível salvar seu perfil.'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-container flex flex-col px-6 py-10 min-h-screen">
      <div className="flex justify-end">
        <button onClick={handleLogout} className="text-primary hover:text-primary-600 flex items-center gap-1 text-sm font-medium">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sair
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-8 max-w-sm mx-auto w-full">
        <div className="flex flex-col items-center gap-3">
          <img src="/images/avante_logo.png" alt="Avante" className="w-24 h-24 object-contain" />
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            Como você quer usar o Avante?
          </h1>
          <p className="text-gray-500 text-center text-sm">
            Você pode mudar isso depois, se precisar
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <button
            onClick={() => navigate('/confirm-data')}
            disabled={loading}
            className="btn-primary w-full text-base py-5 gap-3"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Sou médico veterinário
          </button>

          <button
            onClick={setAsClient}
            disabled={loading}
            className="btn-outline w-full text-base py-5 gap-3"
          >
            {loading ? <Spinner /> : (
              <>
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Preciso de atendimento para meu animal
              </>
            )}
          </button>
        </div>

        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 text-center">
          <p className="text-primary font-semibold mb-1">Sobre o Avante</p>
          <p className="text-gray-500 text-sm leading-relaxed">
            Conectamos tutores e produtores a médicos veterinários que atendem a domicílio — na cidade e no campo. Agende, acompanhe e converse pelo app.
          </p>
        </div>
      </div>
    </div>
  )
}
