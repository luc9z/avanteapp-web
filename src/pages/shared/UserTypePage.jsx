/**
 * UserTypePage - escolha do tipo de conta.
 *
 * Desenhada para ser óbvia à primeira vista (inclusive para quem não
 * tem intimidade com apps): dois cartões grandes lado a lado, cada um
 * com ilustração, título curto e uma frase em primeira pessoa.
 * As ilustrações são SVG inline - sem download, nítidas em qualquer
 * tela e já adaptadas à paleta do sistema.
 */
import { useNavigate } from 'react-router-dom'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { clearRoleCache } from '../../services/userRole'
import { friendlyError } from '../../utils/errors'
import { showToast } from '../../components/common/Toast'
import { useState } from 'react'
import Spinner from '../../components/common/Spinner'

/* ── Ilustrações ──────────────────────────────────────────────── */

/** Veterinário (jaleco + estetoscópio) cuidando de um cão. */
function VetIllustration() {
  return (
    <svg viewBox="0 0 200 150" className="w-full h-full" role="img" aria-label="Veterinário cuidando de um animal">
      <circle cx="100" cy="78" r="62" fill="currentColor" opacity="0.08" />
      {/* Maca */}
      <rect x="34" y="104" width="132" height="9" rx="4.5" fill="currentColor" opacity="0.25" />
      {/* Cão deitado */}
      <ellipse cx="118" cy="94" rx="34" ry="14" fill="#c89b6a" />
      <circle cx="150" cy="84" r="15" fill="#d8ab78" />
      <ellipse cx="161" cy="88" rx="7" ry="5" fill="#8a6a43" />
      <path d="M141 72c-5-7-3-13 3-11 4 1 6 5 6 9z" fill="#a87d51" />
      <circle cx="155" cy="81" r="2.2" fill="#3f2d1c" />
      <ellipse cx="163" cy="87" rx="4" ry="3" fill="#5a4130" />
      <path d="M86 96c-8 2-12 6-10 10" stroke="#c89b6a" strokeWidth="6" strokeLinecap="round" fill="none" />
      {/* Veterinário */}
      <circle cx="64" cy="52" r="16" fill="#f0c9a8" />
      <path d="M48 50a16 16 0 0132 0c0-12-6-17-16-17s-16 5-16 17z" fill="#4a3b30" />
      <path d="M44 104V78a20 20 0 0140 0v26z" fill="#ffffff" />
      <path d="M44 104V78a20 20 0 0110-17.4V104z" fill="currentColor" opacity="0.12" />
      {/* Estetoscópio */}
      <path d="M58 68v10a10 10 0 0020 0V68" stroke="var(--color-primary)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="78" cy="82" r="4.5" fill="var(--color-primary)" />
      {/* Braço tocando o cão */}
      <path d="M82 84c10 2 18 5 24 8" stroke="#f0c9a8" strokeWidth="9" strokeLinecap="round" fill="none" />
      {/* Coração */}
      <path d="M104 42c0-5 7-6 8-1 1-5 8-4 8 1 0 6-8 10-8 10s-8-4-8-10z" fill="var(--color-primary)" opacity="0.55" />
    </svg>
  )
}

/** Tutor abraçando seu pet. */
function TutorIllustration() {
  return (
    <svg viewBox="0 0 200 150" className="w-full h-full" role="img" aria-label="Tutor com seu animal de estimação">
      <circle cx="100" cy="78" r="62" fill="currentColor" opacity="0.08" />
      {/* Pessoa */}
      <circle cx="78" cy="48" r="17" fill="#e8b894" />
      <path d="M61 46a17 17 0 0134 0c0-13-7-18-17-18s-17 5-17 18z" fill="#2f2a26" />
      <path d="M52 116V80a26 26 0 0152 0v36z" fill="var(--color-primary)" />
      <path d="M52 116V80a26 26 0 0113-22.5V116z" fill="#ffffff" opacity="0.14" />
      {/* Gato no colo */}
      <ellipse cx="120" cy="98" rx="24" ry="19" fill="#8e8b86" />
      <circle cx="134" cy="79" r="14" fill="#9c9994" />
      <path d="M124 68l-2-10 10 5z" fill="#9c9994" />
      <path d="M144 68l2-10-10 5z" fill="#9c9994" />
      <circle cx="130" cy="78" r="2" fill="#2f2a26" />
      <circle cx="139" cy="78" r="2" fill="#2f2a26" />
      <path d="M132 85h5" stroke="#2f2a26" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M142 108c8 4 12 10 10 15" stroke="#8e8b86" strokeWidth="7" strokeLinecap="round" fill="none" />
      {/* Braço abraçando */}
      <path d="M96 88c10 6 18 9 28 10" stroke="#e8b894" strokeWidth="10" strokeLinecap="round" fill="none" />
      {/* Coração */}
      <path d="M96 44c0-5 7-6 8-1 1-5 8-4 8 1 0 6-8 10-8 10s-8-4-8-10z" fill="var(--color-primary)" opacity="0.55" />
    </svg>
  )
}

/**
 * Ilustração: usa a arte em /images quando ela existe e cai no SVG
 * embutido se o arquivo faltar. Assim a tela nunca quebra por causa de
 * um asset ausente.
 */
function Illustration({ src, alt, fallback }) {
  const [failed, setFailed] = useState(false)
  if (failed) return fallback
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-full h-full object-contain"
    />
  )
}

/* ── Cartão de escolha ────────────────────────────────────────── */
function ChoiceCard({ illustration, title, subtitle, cta, onClick, disabled, busy }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group relative flex flex-col items-center text-center gap-4 p-6 rounded-3xl
                 bg-white border-2 border-gray-200 shadow-card
                 transition-all duration-200 h-full
                 hover:border-primary hover:shadow-card-hover hover:-translate-y-1
                 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15
                 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed
                 disabled:hover:translate-y-0 disabled:hover:border-gray-200"
    >
      <div className="w-full max-w-[13rem] h-36 text-primary transition-transform duration-300 group-hover:scale-105">
        {illustration}
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-bold text-gray-900 leading-snug">{title}</h2>
        <p className="text-sm text-gray-500 leading-relaxed max-w-[15rem]">{subtitle}</p>
      </div>

      <span
        className="mt-auto inline-flex items-center justify-center gap-2 w-full min-h-[48px] px-5 rounded-2xl
                   text-sm font-bold border-2 border-primary text-primary
                   transition-colors duration-200
                   group-hover:bg-primary group-hover:text-white"
      >
        {busy ? <Spinner /> : (
          <>
            {cta}
            <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </>
        )}
      </span>
    </button>
  )
}

/* ── Página ───────────────────────────────────────────────────── */
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
    <div className="page-container flex flex-col px-5 sm:px-6 py-6 min-h-screen">
      <div className="flex justify-end">
        <button onClick={handleLogout} className="btn-ghost btn-sm">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sair
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-8 w-full max-w-3xl mx-auto py-4">

        {/* Cabeçalho */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/images/avante_logo.png" alt="Avante" className="w-20 h-20 object-contain" />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
            Como você quer usar o AVANTE?
          </h1>
          <p className="text-gray-500 text-base max-w-md">
            Escolha uma das opções abaixo. Você pode mudar isso depois, se precisar.
          </p>
        </div>

        {/* Escolha lado a lado */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ChoiceCard
            illustration={
              <Illustration
                src="/images/escolha-veterinario.png"
                alt="Veterinário examinando um cão com estetoscópio"
                fallback={<VetIllustration />}
              />
            }
            title="Sou veterinário"
            subtitle="Quero atender clientes e organizar meus atendimentos pelo app."
            cta="Começar como veterinário"
            onClick={() => navigate('/confirm-data')}
            disabled={loading}
          />
          <ChoiceCard
            illustration={
              <Illustration
                src="/images/escolha-tutor.png"
                alt="Tutor abraçando seu cão e seu gato"
                fallback={<TutorIllustration />}
              />
            }
            title="Tenho um animal"
            subtitle="Preciso de um veterinário para atender meu animal em casa."
            cta="Procurar veterinário"
            onClick={setAsClient}
            disabled={loading}
            busy={loading}
          />
        </div>

        {/* Sobre */}
        <div className="card text-center">
          <p className="text-primary font-bold text-sm mb-1">Sobre o AVANTE</p>
          <p className="text-gray-500 text-sm leading-relaxed max-w-xl mx-auto">
            Conectamos tutores e produtores a médicos veterinários que atendem a
            domicílio, na cidade e no campo. Agende, acompanhe e converse pelo app.
          </p>
        </div>
      </div>
    </div>
  )
}
