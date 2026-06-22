import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  doc, getDoc, collection, query, orderBy, limit, getDocs,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import Stars from '../../components/common/Stars'
import { ClientBottomNav } from '../../components/common/BottomNav'
import ScheduleSheet from '../../components/client/ScheduleSheet'
import { isOnlineCheck, isFeatured } from '../../components/client/ProfCard'
import { openDirectChat } from '../../services/directChat'
import { showToast } from '../../components/common/Toast'
import { friendlyError } from '../../utils/errors'
import OffersBanner from '../../components/client/OffersBanner'

/* ── Main ─────────────────────────────────────────────────────── */
export default function ProfessionalDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  async function handleMessage() {
    try {
      const snap = await getDoc(doc(db, 'users', user.uid))
      const chatId = await openDirectChat(user, profile, snap.data()?.name)
      navigate(`/chat/${chatId}`)
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível abrir a conversa.'), 'error')
    }
  }

  useEffect(() => {
    if (!id) return
    Promise.all([
      getDoc(doc(db, 'users', id)),
      getDocs(query(collection(db, 'users', id, 'ratings'), orderBy('createdAt', 'desc'), limit(5))),
    ]).then(([profSnap, ratingsSnap]) => {
      if (profSnap.exists()) setProfile({ uid: id, ...profSnap.data() })
      setRatings(ratingsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen"><Spinner size={32} color="#375337" /></div>
  )

  if (!profile) return (
    <div className="page-container">
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-primary">Profissional</h1>
        <div className="w-6" />
      </div>
      <p className="text-center py-16 text-gray-400">Profissional não encontrado</p>
    </div>
  )

  const specialties = Array.isArray(profile.specialties) && profile.specialties.length > 0
    ? profile.specialties
    : profile.specialty ? [profile.specialty] : ['Consulta Geral']

  const avgRating = ratings.length
    ? (ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / ratings.length)
    : null

  return (
    <>
      <div className="page-container" style={{ paddingBottom: '10.5rem' }}>
        {/* ── Green header ─────────────────────────────────── */}
        <div className="bg-primary px-4 pt-12 pb-8 relative">
          <button onClick={() => navigate(-1)}
            className="absolute top-4 left-4 text-white/80 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex flex-col items-center gap-3 mt-2">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt={profile.name}
                className="w-20 h-20 rounded-full object-cover border-4 border-white/30" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-4xl font-bold text-white border-4 border-white/30">
                {(profile.name || '?')[0]}
              </div>
            )}
            <div className="text-center">
              <h1 className="text-xl font-bold text-white">{profile.name}</h1>
              <p className="text-white/70 text-sm">Médico Veterinário</p>
            </div>
            {avgRating !== null && (
              <div className="flex items-center gap-1.5 bg-white/15 px-3 py-1.5 rounded-full">
                <svg className="w-4 h-4 text-yellow-300" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span className="text-white font-bold text-sm">{avgRating.toFixed(1)}</span>
                <span className="text-white/60 text-xs">({ratings.length} avaliações)</span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pt-4 flex flex-col gap-4">

          {/* ── Sobre ────────────────────────────────────── */}
          {profile.bio && (
            <div className="card">
              <p className="font-bold text-gray-800 text-sm mb-2">Sobre</p>
              <p className="text-sm text-gray-600 leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {/* ── Dados do profissional ────────────────────── */}
          <div className="card">
            <p className="font-bold text-gray-800 text-sm mb-4">Dados do profissional</p>
            <div className="flex flex-col divide-y divide-gray-50">
              {profile.council && (
                <ProfRow iconPath="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  label="CRMV" value={profile.council} />
              )}
              {profile.phone && (
                <ProfRow iconPath="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  label="Telefone" value={profile.phone} href={`tel:${profile.phone}`} />
              )}
              {profile.email && (
                <ProfRow iconPath="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  label="E-mail" value={profile.email} href={`mailto:${profile.email}`} />
              )}
            </div>
          </div>

          {/* ── Áreas de atuação ─────────────────────────── */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-primary/10 p-1.5 rounded-lg">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <p className="font-bold text-gray-800 text-sm">Áreas de atuação</p>
              </div>
              <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">
                {specialties.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {specialties.map(s => (
                <div key={s} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm text-gray-700 font-medium">{s}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Avaliações de clientes ───────────────────── */}
          <div>
            <p className="font-bold text-gray-800 mb-3">Avaliações de clientes</p>
            {ratings.length === 0 ? (
              <div className="card flex flex-col items-center py-10 gap-3">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-gray-400 text-sm">Ainda sem avaliações</p>
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
                {ratings.map(r => (
                  <div key={r.id} className="flex-shrink-0 w-64 card border border-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <Stars rating={Number(r.rating) || 0} size={14} />
                      <span className="text-xs text-gray-400">{r.clientName || 'Cliente'}</span>
                    </div>
                    <p className="text-gray-600 text-sm italic leading-relaxed line-clamp-3">
                      {r.comment || 'Sem comentário.'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <OffersBanner className="mt-2" audience="client" />
        </div>
      </div>

      {/* ── Barra de ações (fixa, acima da navegação) ─────────── */}
      <div className="fixed left-1/2 -translate-x-1/2 w-full max-w-2xl z-20 px-4"
           style={{ bottom: 'calc(3.9rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="bg-white border border-gray-100 shadow-card-hover rounded-2xl p-2.5 flex gap-2 animate-fade-up">
          <button
            onClick={() => setScheduleOpen(true)}
            className="flex-1 btn-primary py-3"
          >
            {isOnlineCheck(profile) ? 'Solicitar atendimento' : 'Agendar atendimento'}
          </button>
          {/* Chat antes da solicitação — exclusivo Premium (suspenso para os demais) */}
          {(() => {
            const premium = profile && isFeatured(profile)
            return (
              <button
                onClick={premium ? handleMessage : undefined}
                disabled={!premium}
                title={premium ? 'Conversar antes de solicitar' : 'Conversa antes do atendimento é exclusiva de veterinários Premium'}
                className={`relative w-12 rounded-xl border-2 flex items-center justify-center transition-all ${
                  premium
                    ? 'border-primary/30 text-primary hover:bg-primary/5 active:scale-95 cursor-pointer'
                    : 'border-gray-200 text-gray-300 opacity-50 cursor-not-allowed'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {!premium && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm3 8H9V6a3 3 0 016 0v3z" />
                    </svg>
                  </span>
                )}
              </button>
            )
          })()}
        </div>
      </div>

      <ClientBottomNav />

      <ScheduleSheet
        open={scheduleOpen}
        professional={profile}
        user={user}
        onClose={() => setScheduleOpen(false)}
      />
    </>
  )
}

function ProfRow({ iconPath, label, value, href }) {
  const inner = (
    <div className="flex items-center gap-3 py-3">
      <div className="bg-primary/8 p-2 rounded-lg flex-shrink-0">
        <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
        </svg>
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
  if (href) return <a href={href} className="hover:opacity-75 transition-opacity">{inner}</a>
  return <div>{inner}</div>
}
