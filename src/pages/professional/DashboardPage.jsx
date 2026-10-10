import { useEffect, useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  collection, doc, onSnapshot, query, where, orderBy, getDocs,
  updateDoc, addDoc, serverTimestamp, Timestamp, limit,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { showToast } from '../../components/common/Toast'
import { friendlyError } from '../../utils/errors'
import EnablePushBanner from '../../components/common/EnablePushBanner'
import { ThemeToggle } from '../../contexts/ThemeContext'
import AdBanner from '../../components/common/AdBanner'
import { VetBottomNav } from '../../components/common/BottomNav'
import { directChatId } from '../../services/directChat'
import { isPending, isActive, normalizeStatus, statusInfo } from '../../utils/status'
import { vetCoversSpecies } from '../../utils/specialties'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/* ── helpers ─────────────────────────────────────────────────── */
function formatDate(ts) {
  if (!ts) return '-'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return format(d, 'dd/MM/yyyy - HH:mm', { locale: ptBR })
}

/**
 * Só as CORES vivem aqui. O texto do selo sai de statusInfo(), em
 * utils/status.js, porque mapa de rótulo duplicado por tela sempre
 * atrasa: um status novo aparecia como a chave crua do banco.
 */
const CORES_STATUS_ATIVO = {
  aceito:             'bg-green-500 text-white',
  a_caminho:          'bg-blue-500 text-white',
  em_andamento:       'bg-primary text-white',
  pausado:            'bg-orange-400 text-white',
  orcamento:          'bg-amber-500 text-white',
  orcamento_recusado: 'bg-red-500 text-white',
}

/* ── component ───────────────────────────────────────────────── */
export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid

  const [profile, setProfile] = useState(null)
  // Catálogo de planos: o nome exibido tem que ser o que o admin
  // configurou, senão um plano novo ou renomeado aparece como "Free".
  const [catalogoPlanos, setCatalogoPlanos] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [requests, setRequests] = useState([])
  const [activeRequests, setActiveRequests] = useState([])
  const [metrics, setMetrics] = useState({ monthly: 0, clients: 0 })
  const [upcomingAppointments, setUpcomingAppointments] = useState([])
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [liveRating, setLiveRating] = useState(null) // { avg, count } em tempo real
  const [unreadChats, setUnreadChats] = useState(0)
  const [totalChats, setTotalChats] = useState(0)

  /* ── listeners ─────────────────────────────────────────────── */
  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'plans'),
      snap => setCatalogoPlanos(Array.isArray(snap.data()?.plans) ? snap.data().plans : null),
      () => setCatalogoPlanos(null),   // sem catálogo, cai no nome do próprio id
    )
  }, [])

  useEffect(() => {
    if (!uid) return
    return onSnapshot(doc(db, 'users', uid), snap => {
      setProfile(snap.exists() ? snap.data() : null)
      setLoadingProfile(false)
    })
  }, [uid])

  useEffect(() => {
    if (!uid) return
    const q = query(
      collection(db, 'requests'),
      where('professionalId', '==', uid),
      orderBy('createdAt', 'desc')
    )
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setRequests(all)
      setActiveRequests(all.filter(r => isActive(r.status)))
    }, () => {})
  }, [uid])

  const [urgentRequests, setUrgentRequests] = useState([])
  useEffect(() => {
    const q = query(collection(db, 'requests'), where('status', '==', 'urgente'))
    return onSnapshot(q, snap => {
      const now = new Date()
      setUrgentRequests(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(r => !r.professionalId && r.urgentExpiry && new Date(r.urgentExpiry) > now)
      )
    }, err => console.error('[urgências] listener falhou:', err))
  }, [])

  // Emergências só aparecem para vets cuja área de atuação (specialties)
  // cobre a espécie da solicitação. Compat: requests antigos sem `species`
  // (undefined) passam para todos, para não sumirem retroativamente.
  const visibleUrgents = useMemo(
    () => urgentRequests.filter(r => vetCoversSpecies(profile?.specialties, r.species)),
    [urgentRequests, profile?.specialties]
  )

  // Conversas com mensagem do cliente aguardando resposta -
  // este é o sinal real de "mensagens", não solicitações pendentes.
  useEffect(() => {
    if (!uid) return
    return onSnapshot(
      query(collection(db, 'chats'), where('participants', 'array-contains', uid)),
      snap => {
        const withMsg = snap.docs.filter(d => !!d.data().lastMessage)
        setTotalChats(withMsg.length)
        setUnreadChats(withMsg.filter(d => {
          const c = d.data()
          return c.lastMessageSenderId && c.lastMessageSenderId !== uid && c[`read_${uid}`] !== true
        }).length)
      },
      () => {}
    )
  }, [uid])

  // Avaliações em tempo real, direto da subcoleção (não depende do
  // agregado do perfil, que só atualiza via Cloud Function)
  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'ratings'), snap => {
      const all = snap.docs.map(d => Number(d.data()?.rating || 0))
      const count = all.length
      const avg = count ? all.reduce((a, b) => a + b, 0) / count : 0
      setLiveRating({ avg, count })
    }, () => {})
  }, [uid])

  useEffect(() => {
    if (!uid) return
    loadMetrics()
    loadUpcoming()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  async function loadMetrics() {
    try {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const snap = await getDocs(query(collection(db, 'requests'), where('professionalId', '==', uid)))
      const monthly = snap.docs.filter(d => {
        const ts = d.data().createdAt
        if (!ts?.toDate) return false
        const dt = ts.toDate()
        return dt >= start && dt < end
      }).length
      const servedSnap = await getDocs(query(
        collection(db, 'appointments'),
        where('professionalId', '==', uid),
        where('status', 'in', ['finalizado', 'done'])
      ))
      setMetrics({ monthly, clients: servedSnap.size })
    } catch (_) {}
  }

  async function loadUpcoming() {
    try {
      const snap = await getDocs(query(
        collection(db, 'appointments'),
        where('professionalId', '==', uid),
        where('date', '>', Timestamp.fromDate(new Date())),
        orderBy('date'),
        limit(3)
      ))
      setUpcomingAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (_) {}
  }

  async function toggleOnline() {
    if (!uid || !profile) return
    setUpdatingStatus(true)
    try {
      await updateDoc(doc(db, 'users', uid), { is_online: !profile.is_online })
      showToast(!profile.is_online ? 'Você está Online' : 'Você está Offline', 'info')
    } catch { showToast('Erro ao atualizar status', 'error') }
    finally { setUpdatingStatus(false) }
  }

  async function acceptRequest(req) {
    try {
      const appRef = await addDoc(collection(db, 'appointments'), {
        professionalId: req.professionalId, clientId: req.clientId,
        clientName: req.clientName, service: req.service, location: req.location,
        date: req.requestedTimestamp || serverTimestamp(),
        requestId: req.id, status: 'aceito', createdAt: serverTimestamp(),
      })
      await updateDoc(doc(db, 'requests', req.id), { status: 'aceito', appointmentId: appRef.id })
      showToast('Solicitação aceita!', 'success')
    } catch (e) { showToast(friendlyError(e), 'error') }
  }

  async function rejectRequest(id) {
    try {
      await updateDoc(doc(db, 'requests', id), { status: 'rejeitado' })
      showToast('Solicitação recusada', 'info')
    } catch (e) { showToast(friendlyError(e), 'error') }
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  async function markAllRead() {
    const toMark = requests.filter(x => !x.professionalRead)
    setNotifOpen(false)
    await Promise.all(
      toMark.map(r => updateDoc(doc(db, 'requests', r.id), { professionalRead: true }).catch(() => {}))
    )
  }

  if (loadingProfile) return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner size={32} color="#375337" />
    </div>
  )

  const pending = requests.filter(r => isPending(r.status))
  const unread = requests.filter(r => !r.professionalRead)
  const name = profile?.name || 'Profissional'
  const isOnline = profile?.is_online === true

  // Tema do card conforme o plano. Todos partem do verde do sistema -
  // o plano é sinalizado por um acento sutil, não trocando a cor inteira.
  const planKey = ['premium', 'destaque'].includes(profile?.plan) ? 'premium'
    : profile?.plan === 'essencial' ? 'essencial' : 'free'
  const CARD_THEME = {
    free:      { card: 'plan-card plan-free',      glow: 'bg-white/5',            badge: 'plan-badge-free' },
    essencial: { card: 'plan-card plan-essencial', glow: 'bg-emerald-300/10',     badge: 'plan-badge-essencial' },
    premium:   { card: 'plan-card plan-premium',   glow: 'bg-amber-200/10',       badge: 'plan-badge-premium' },
  }[planKey]
  /* Nome do plano assinado. Sem catálogo carregado, mostra o próprio
     id com inicial maiúscula - errado é mostrar "Free" para quem pagou. */
  const idPlano = profile?.plan || 'free'
  const nomeDoPlano = catalogoPlanos?.find(p => p.id === idPlano)?.name
    || idPlano.charAt(0).toUpperCase() + idPlano.slice(1)

  const rating = liveRating?.avg ?? profile?.averageRating ?? 0
  const ratingCount = liveRating?.count ?? profile?.ratingCount ?? 0
  const specialties = Array.isArray(profile?.specialties)
    ? profile.specialties.join(', ')
    : (profile?.specialty || 'Não informado')

  return (
    <div className="page-container">
      {/* ── Topbar ─────────────────────────────────────────────── */}
      <div className="topbar">
        <span className="page-title">Painel</span>
        <div className="flex items-center gap-1">
          <button className="relative p-2" onClick={() => setNotifOpen(true)}>
            <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unread.length > 0 && (
              <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {unread.length > 9 ? '9+' : unread.length}
              </span>
            )}
          </button>
          <ThemeToggle />
          <button onClick={handleLogout} className="p-2 text-primary hover:text-red-500 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-4 py-4 pb-nav flex flex-col gap-4">

        {/* ── Profile card (cor conforme o plano) ─────────────── */}
        <div className={`${CARD_THEME.card} !p-5`}>
          {/* Decorative glow */}
          <div className="absolute -right-8 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className={`absolute -left-6 -bottom-10 w-32 h-32 rounded-full blur-2xl pointer-events-none ${CARD_THEME.glow}`} />
          <div className="flex items-center gap-4 mb-4">
            <Link to="/edit-profile">
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt={name}
                  className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-white/30" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold flex-shrink-0">
                  {name[0]}
                </div>
              )}
            </Link>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-lg truncate">{name}</p>
              <p className="text-white/75 text-sm">Médico Veterinário</p>
              <p className="text-white/60 text-xs">CRMV {profile?.council || '-'}</p>
            </div>
            {(() => {
              const LABEL = { free: 'Free', essencial: 'Essencial', premium: 'Premium', destaque: 'Premium' }
              const plan = idPlano
              return (
                <Link to="/plans"
                  className={`plan-badge ${CARD_THEME.badge} self-start active:scale-95 transition-transform`}>
                  <IconePlano plano={plan} />
                  {LABEL[plan] || plan}
                </Link>
              )
            })()}
          </div>

          {/* Online toggle inside card */}
          <button
            onClick={toggleOnline}
            disabled={updatingStatus}
            data-coach="vet-online"
            className={`btn-row ${
              isOnline
                ? 'bg-green-500/20 border border-green-400/40'
                : 'bg-white/10 border border-white/20'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3 flex-shrink-0">
                {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-70" />}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${isOnline ? 'bg-green-400' : 'bg-white/30'}`} />
              </span>
              <div className="text-left">
                <p className={`text-sm font-bold leading-none ${isOnline ? 'text-green-300' : 'text-white/60'}`}>
                  {isOnline ? 'Você está online' : 'Você está offline'}
                </p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  {isOnline ? 'Clientes podem te encontrar' : 'Toque para ficar disponível'}
                </p>
              </div>
            </div>
            {updatingStatus
              ? <Spinner size={16} color="white" />
              : (
                <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${isOnline ? 'bg-green-400' : 'bg-white/20'}`}>
                  <span className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-md transition-transform ${isOnline ? 'translate-x-6' : 'translate-x-1'}`}
                        style={{ width: '18px', height: '18px' }} />
                </div>
              )
            }
          </button>
        </div>

        {/* ── Notificações push ──────────────────────────────── */}
        <EnablePushBanner
          uid={uid}
          message="Ative as notificações para receber cada nova solicitação na hora, mesmo com o app fechado."
        />

        {/* ── Urgências ─────────────────────────────────────── */}
        {visibleUrgents.length > 0 && (
          <div>
            <p className="section-title !mb-2 flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              Atendimentos Urgentes
              <span className="bg-red-500 text-white text-[11px] font-bold rounded-full px-1.5 py-0.5">
                {visibleUrgents.length}
              </span>
            </p>
            <div className="flex flex-col gap-2.5">
              {visibleUrgents.map(r => {
                const expiry = r.urgentExpiry ? new Date(r.urgentExpiry) : null
                const minsLeft = expiry ? Math.max(0, Math.round((expiry - new Date()) / 60000)) : null
                return (
                  <div key={r.id} className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-red-800 text-sm">{r.animal || 'Animal não informado'}</p>
                        <p className="text-xs text-red-600 mt-0.5 line-clamp-2">{r.notes}</p>
                        <p className="text-xs text-gray-500 mt-1">Cliente: {r.clientName}</p>
                      </div>
                      {minsLeft !== null && (
                        <span className="flex-shrink-0 bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                          {minsLeft}min
                        </span>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        const { updateDoc, doc: fsDoc } = await import('firebase/firestore')
                        await updateDoc(fsDoc(db, 'requests', r.id), {
                          professionalId: uid,
                          professionalName: profile?.name || '',
                          status: 'aceito',
                          statusHistory: [{ status: 'aceito', at: new Date().toISOString() }],
                        }).catch(() => showToast('Erro ao aceitar urgência', 'error'))
                        showToast('Urgência aceita! Entre em contato com o cliente.', 'success')
                        navigate(`/request/${r.id}`)
                      }}
                      className="btn-danger-solid btn-block"
                    >
                      Aceitar urgência
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Plano ───────────────────────────────────────────
             Fica logo abaixo do perfil: é a primeira coisa depois das
             urgências, que são as únicas com pressa maior.
             O nome sai de config/plans, não de uma lista fixa aqui -
             com a lista fixa, um plano renomeado ou criado pelo admin
             aparecia como "Free" mesmo depois de assinado. */}
        {(() => {
          const ehPremium = ['premium', 'destaque'].includes(profile?.plan)
          const plano = nomeDoPlano
          // Plano pago vence (PIX não renova sozinho). Perto do fim, o
          // cartão vira um lembrete de renovação.
          const vence = profile?.planExpiresAt?.toDate?.() || null
          const dias = vence ? Math.ceil((vence.getTime() - Date.now()) / 864e5) : null
          const renovar = dias != null && dias <= 5
          return (
            <Link to="/plans" data-coach="vet-plano"
              className={`flex items-center gap-3 rounded-2xl p-4 transition-all
                          duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.99] ${
                ehPremium
                  ? 'card hover:shadow-card-hover'
                  : 'bg-gradient-to-r from-amber-400 to-amber-500 shadow-[0_4px_16px_rgba(245,158,11,0.3)] hover:opacity-95'
              }`}>
              <div className="flex-1 min-w-0">
                <p className={`text-[10px] font-bold uppercase tracking-wide ${
                  ehPremium ? 'text-gray-400' : 'text-white/70'}`}>
                  Seu plano: {plano}
                </p>
                <p className={`font-bold text-sm mt-0.5 ${ehPremium ? 'text-gray-800' : 'text-white'}`}>
                  {ehPremium ? 'Gerenciar assinatura' : 'Apareça primeiro na busca'}
                </p>
                <p className={`text-xs mt-0.5 ${renovar ? 'font-semibold text-red-500' : ehPremium ? 'text-gray-500' : 'text-white/85'}`}>
                  {renovar
                    ? (dias <= 0 ? 'Vence hoje. Renove para não perder o plano.'
                      : `Vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}. Renove para não perder o plano.`)
                    : vence ? `Vale até ${vence.toLocaleDateString('pt-BR')}`
                    : ehPremium ? 'Trocar de plano quando quiser'
                    : 'Receba mais pedidos com o selo de destaque'}
                </p>
              </div>
              <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-xl px-3.5 min-h-[44px]
                                text-xs font-bold whitespace-nowrap ${
                ehPremium
                  ? 'border border-primary/40 text-primary'
                  : 'bg-white text-amber-700 shadow-sm'
              }`}>
                {renovar ? 'Renovar' : ehPremium ? 'Trocar' : 'Ver planos'}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          )
        })()}

        {/* ── Completar perfil ─────────────────────────────────
             O cadastro inicial só pede o necessário para receber pedidos.
             Foto, apresentação e localização ficam para depois, e este
             cartão garante que o "depois" aconteça. Some quando completo. */}
        {(() => {
          if (!profile) return null
          const itens = [
            { ok: !!profile.photoURL, rotulo: 'Foto' },
            { ok: !!profile.bio?.trim(), rotulo: 'Apresentação' },
            { ok: profile.baseLocation?.lat != null, rotulo: 'Localização' },
          ]
          const feitos = itens.filter(i => i.ok).length
          if (feitos === itens.length) return null
          return (
            <Link to="/edit-profile" data-coach="vet-completar-perfil"
              className="card flex flex-col gap-3 transition-all hover:-translate-y-px hover:shadow-card-hover">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-gray-800">Complete seu perfil</p>
                <span className="text-xs font-semibold text-gray-400">{feitos} de {itens.length}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${(feitos / itens.length) * 100}%` }} />
              </div>
              <p className="text-xs text-gray-500">É o que o cliente vê antes de te chamar.</p>
              <div className="flex flex-wrap gap-2">
                {itens.map(i => (
                  <span key={i.rotulo} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    i.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500'
                  }`}>
                    {i.ok ? (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
                      </svg>
                    )}
                    {i.rotulo}
                  </span>
                ))}
              </div>
            </Link>
          )
        })()}

        {/* ── Atendimento Atual ──────────────────────────────── */}
        {activeRequests.length > 0 && (
          <div>
            <p className="section-title">Atendimento Atual</p>
            <div className="flex flex-col gap-3">
              {activeRequests.slice(0, 2).map(r => {
                const s = normalizeStatus(r.status)
                const sLabel = statusInfo(r.status).label
                const sColor = CORES_STATUS_ATIVO[s] || 'bg-gray-400 text-white'
                return (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/request/${r.id}`)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/request/${r.id}`) }
                    }}
                    className="rounded-2xl bg-primary p-4 shadow-lg text-white cursor-pointer
                               transition-transform duration-200 hover:-translate-y-px active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-base flex-shrink-0">
                        {(r.clientName || '?')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{r.clientName}</p>
                        <p className="text-white/70 text-xs truncate">{r.service}</p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${sColor}`}>
                        {sLabel}
                      </span>
                    </div>

                    {/* Primary action */}
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/request/${r.id}`) }}
                      className="w-full bg-white/15 hover:bg-white/25 text-white font-semibold
                                 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors mb-2"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                      </svg>
                      Ir ao Atendimento
                    </button>

                    {/* Ação secundária - o resto do cartão já abre a solicitação */}
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          navigate(`/chat/${r.chatId || directChatId(r.clientId, r.professionalId)}`)
                        }}
                        className="bg-white/10 hover:bg-white/20 text-white text-sm font-medium
                                   py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Chat
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Solicitações Pendentes ─────────────────────────── */}
        <div data-coach="vet-pending">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title !mb-0">
              Solicitações Pendentes
              {pending.length > 0 && (
                <span className="inline-flex items-center justify-center bg-red-500 text-white
                                 text-[11px] font-bold rounded-full min-w-[20px] h-5 px-1.5 leading-none">
                  {pending.length > 3 ? '3+' : pending.length}
                </span>
              )}
            </p>
            <Link to="/pending-requests" className="text-primary text-sm font-medium hover:underline">
              Ver todas
            </Link>
          </div>

          {pending.length === 0
            ? <div className="card text-center py-8 text-gray-400 text-sm">Nenhuma solicitação pendente</div>
            : (
              <div className="flex flex-col gap-3">
                {pending.slice(0, 3).map(r => (
                  <RequestCard
                    key={r.id} req={r}
                    onAccept={() => acceptRequest(r)}
                    onReject={() => rejectRequest(r.id)}
                    onClick={() => navigate(`/request/${r.id}`)}
                  />
                ))}
              </div>
            )
          }
        </div>

        {/* ── Próximos Atendimentos ──────────────────────────── */}
        {upcomingAppointments.length > 0 && (
          <div>
            <p className="section-title">Próximos Atendimentos</p>
            <div className="flex flex-col gap-3">
              {upcomingAppointments.map(a => (
                <div
                  key={a.id}
                  className="card cursor-pointer hover:shadow-card-hover transition-shadow"
                  onClick={() => a.requestId && navigate(`/request/${a.requestId}`)}
                >
                  <p className="font-bold text-primary truncate">{a.service}</p>
                  <p className="text-gray-500 text-sm mt-1 truncate">Cliente: {a.clientName}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-gray-400 text-xs">{formatDate(a.date)}</span>
                    <span className="badge-accepted">Confirmado</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* ── Ações Rápidas ──────────────────────────────────── */}
        <div>
          <p className="section-title">Ações Rápidas</p>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/agenda" className="card flex flex-col items-center gap-2 py-5 hover:shadow-card-hover transition-shadow active:scale-95">
              <div className="bg-primary/10 p-3 rounded-xl">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="font-semibold text-primary text-sm">Agenda</span>
            </Link>
            <Link to="/chats" className="card flex flex-col items-center gap-2 py-5 hover:shadow-card-hover transition-shadow active:scale-95">
              <div className="relative bg-primary/10 p-3 rounded-xl">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {unreadChats > 0 ? (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {unreadChats}
                  </span>
                ) : totalChats > 0 && (
                  <span className="absolute -top-1 -right-1 bg-gray-300 text-gray-600 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {totalChats}
                  </span>
                )}
              </div>
              <span className="font-semibold text-primary text-sm">Conversas</span>
              {unreadChats === 0 && totalChats > 0 && (
                <span className="text-[10px] text-gray-400 -mt-1">tudo lido</span>
              )}
            </Link>
          </div>
        </div>

        {/* ── Resumo do Mês ──────────────────────────────────── */}
        <div>
          <p className="section-title">Resumo do Mês</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => navigate('/pending-requests')}
              className="card text-left cursor-pointer hover:shadow-card-hover active:scale-[0.98] transition-all">
              <div className="flex items-center justify-between mb-1">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
                </svg>
                <span className="text-2xl font-bold text-blue-500">{metrics.monthly}</span>
              </div>
              <p className="text-primary font-semibold text-sm">Solicitações</p>
              <p className="text-gray-400 text-xs">novas no mês</p>
            </button>
            <button type="button" onClick={() => navigate('/reports')}
              className="card text-left cursor-pointer hover:shadow-card-hover active:scale-[0.98] transition-all">
              <div className="flex items-center justify-between mb-1">
                <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-2xl font-bold text-purple-500">{metrics.clients}</span>
              </div>
              <p className="text-primary font-semibold text-sm">Clientes</p>
              <p className="text-gray-400 text-xs">atendidos</p>
            </button>
          </div>
        </div>

        {/* ── Sua avaliação ──────────────────────────────────── */}
        <div className="card flex items-center gap-4">
          <div className="bg-yellow-50 p-3 rounded-xl flex-shrink-0">
            <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-primary">Sua avaliação</p>
            <p className="text-gray-400 text-xs">
              {ratingCount > 0
                ? `Média de ${ratingCount} avaliaç${ratingCount > 1 ? 'ões' : 'ão'} · ao vivo`
                : 'Você ainda não recebeu avaliações'}
            </p>
          </div>
          <span className="text-3xl font-bold text-primary">{ratingCount > 0 ? Number(rating).toFixed(1) : '-'}</span>
          <Link to="/ratings" className="text-primary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* ── Área de atuação ────────────────────────────────── */}
        <div className="card">
          <p className="text-xs text-gray-400 font-medium mb-1">Área de atuação</p>
          <p className="text-primary font-semibold text-sm leading-snug">{specialties}</p>
        </div>

        {/* Anúncios - apenas para veterinários no plano Free */}
        {(!profile?.plan || profile?.plan === 'free') && (
          <AdBanner audience="vet" />
        )}

      </div>

      <VetBottomNav />


      {/* ── Notificações modal ─────────────────────────────── */}
      {notifOpen && (
        <div className="modal-overlay" onClick={() => setNotifOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Notificações</h3>
              <button onClick={() => setNotifOpen(false)} className="text-gray-400 text-2xl leading-none">&times;</button>
            </div>
            {requests.length === 0
              ? <p className="text-gray-400 text-center py-6">Nenhuma notificação</p>
              : (
                <div className="flex flex-col divide-y max-h-80 overflow-y-auto">
                  {requests.map(r => (
                    <div key={r.id} className="py-3 flex items-start gap-3 cursor-pointer"
                      onClick={async () => {
                        await updateDoc(doc(db, 'requests', r.id), { professionalRead: true }).catch(() => {})
                        setNotifOpen(false)
                        navigate(`/request/${r.id}`)
                      }}>
                      <div className={`w-1.5 h-10 rounded-full flex-shrink-0 mt-1 ${r.professionalRead ? 'bg-gray-200' : 'bg-primary'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm truncate ${r.professionalRead ? 'text-gray-500' : 'text-primary'}`}>{r.service}</p>
                        <p className="text-gray-400 text-xs truncate">Solicitante: {r.clientName}</p>
                        <p className="text-gray-300 text-xs">{formatDate(r.createdAt)}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  ))}
                </div>
              )
            }
            <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-gray-100">
              <button onClick={markAllRead} className="text-sm text-primary font-medium hover:underline">
                Marcar todas como lidas
              </button>
              <button onClick={() => setNotifOpen(false)} className="text-sm text-gray-400">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RequestCard({ req, onAccept, onReject, onClick }) {
  return (
    <div className="card cursor-pointer hover:shadow-card-hover transition-shadow" onClick={onClick}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="avatar-circle w-9 h-9 text-sm flex-shrink-0">{(req.clientName || '?')[0]}</div>
          <div className="min-w-0">
            <p className="font-bold text-primary text-sm truncate">{req.clientName}</p>
            <p className="text-gray-400 text-xs truncate">{req.service}</p>
          </div>
        </div>
        <span className="badge-pending flex-shrink-0">Pendente</span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-gray-300 text-xs truncate">{formatDate(req.createdAt)}</span>
        <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onReject}
            className="btn-danger btn-sm">
            Recusar
          </button>
          <button onClick={onAccept}
            className="btn-primary btn-sm">
            Aceitar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Ícone do selo do plano: selo com check (Essencial), estrela (Premium), círculo (Free). */
function IconePlano({ plano }) {
  const cls = 'w-3.5 h-3.5 flex-shrink-0'
  if (plano === 'premium' || plano === 'destaque') {
    return (
      <svg aria-hidden className={cls} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
      </svg>
    )
  }
  if (plano === 'essencial') {
    return (
      <svg aria-hidden className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.8l2.2 1.6 2.7-.1.8 2.6 2.2 1.6-.9 2.5.9 2.5-2.2 1.6-.8 2.6-2.7-.1L12 21.2l-2.2-1.6-2.7.1-.8-2.6-2.2-1.6.9-2.5-.9-2.5 2.2-1.6.8-2.6 2.7.1z" />
        <path d="M8.8 12.2l2.2 2.2 4.2-4.4" />
      </svg>
    )
  }
  return (
    <svg aria-hidden className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
      <circle cx="12" cy="12" r="7" />
    </svg>
  )
}
