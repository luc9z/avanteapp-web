import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { isValidEmail, passwordIssue } from '../../utils/validators'
import Spinner from '../../components/common/Spinner'
import PasswordInput from '../../components/common/PasswordInput'
import { showToast } from '../../components/common/Toast'
import { codigoDeIndicacao } from '../../services/origem'

export default function RegisterPage() {
  const { registerWithEmail, isProcessing, error, clearError } = useAuth()
  const navigate = useNavigate()
  // A URL já foi lida na carga do app (main.jsx). Ler daqui também
  // pega quem chegou por /conheca?ref=X e só depois veio para cá.
  const refCode = codigoDeIndicacao()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [formError, setFormError] = useState('')

  async function handleRegister(e) {
    e.preventDefault()
    setFormError('')
    if (name.trim().length < 2) return setFormError('Informe seu nome completo.')
    if (!isValidEmail(email)) return setFormError('Informe um email válido.')
    const pwError = passwordIssue(password)
    if (pwError) return setFormError(pwError)
    if (password !== confirm) return setFormError('As senhas não coincidem.')

    const user = await registerWithEmail(email.trim(), password, name.trim())
    if (user) {
      showToast('Conta criada! Enviamos um email de verificação.', 'success')
      navigate('/user-type', { replace: true })
    }
  }

  const displayError = formError || error

  return (
    <div className="page-container flex flex-col px-6 py-10">
      <div className="flex items-center gap-2 mb-6">
        <Link to="/login" className="text-primary hover:text-primary-600" aria-label="Voltar para o login">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-primary">Criar conta</h1>
      </div>

      <div className="flex-1 flex flex-col max-w-sm mx-auto w-full gap-8">
        <div className="flex flex-col items-center gap-2">
          <img src="/images/avante_logo.png" alt="Avante" className="w-20 h-20 object-contain" />
          <p className="text-gray-500 text-sm text-center">Leva menos de um minuto</p>
        </div>

        {refCode && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 flex items-center gap-2.5">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
            </svg>
            <span>Você veio pela indicação de um colega (código <strong>{refCode}</strong>).</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          {displayError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3" role="alert">
              {displayError}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Nome completo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); clearError(); setFormError('') }}
              placeholder="Nome e sobrenome"
              autoComplete="name"
              className="input-field"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError(); setFormError('') }}
              placeholder="seu@email.com"
              autoComplete="email"
              className="input-field"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Senha</label>
            <PasswordInput
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError(); setFormError('') }}
              autoComplete="new-password"
            />
            <p className="text-xs text-gray-400 mt-0.5">Mínimo de 8 caracteres, com letras e números.</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Confirmar senha</label>
            <PasswordInput
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setFormError('') }}
              autoComplete="new-password"
            />
          </div>

          <button type="submit" disabled={isProcessing} className="btn-primary w-full mt-2">
            {isProcessing ? <Spinner /> : 'Criar conta'}
          </button>

          <p className="text-[11px] text-gray-400 text-center leading-relaxed">
            Ao criar uma conta, você concorda com os{' '}
            <Link to="/terms" className="text-primary font-semibold hover:underline">Termos de Uso</Link>{' '}
            e a{' '}
            <Link to="/privacy" className="text-primary font-semibold hover:underline">Política de Privacidade</Link>.
          </p>
        </form>

        <p className="text-center text-sm text-gray-500">
          Já tem conta?{' '}
          <Link to="/login" className="text-primary font-semibold hover:underline">
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  )
}
