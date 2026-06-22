import { useEffect, useState } from 'react'
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
import { isPending, isActive, normalizeStatus } from '../../utils/status'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/* ── helpers ─────────────────────────────────────────────────── */
function formatDate(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return format(d, 'dd/MM/yyyy - HH:mm', { locale: ptBR })
}

const ACTIVE_STATUS_LABEL = {
  aceito: { label: 'Pedido Aceito', color: 'bg-green-500 text-white' },
  a_caminho: { label: 'A Caminho', color: 'bg-blue-500 text-white' },
  em_andamento: { label: 'Em Atendimento', color: 'bg-primary text-white' },
  pausado: { label: 'Pausado', color: 'bg-orange-400 text-white' },
}

/* ── component ───────────────────────────────────────────────── */
export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid

  const [profile, setProfile] = useState(null)
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

  // Conversas com mensagem do cliente aguardando resposta —
  // este é o sinal real de "mensagens", não solicitações pendentes.
  useEffect(() => {
    if (!uid) return
    return onSnapshot(
      query(collection(db, 'chats'), where('professionalId', '==', uid)),
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
    for (const r of requests.filter(x => !x.professionalRead)) {
      await updateDoc(doc(db, 'requests', r.id), { professionalRead: true }).catch(() => {})
    }
    setNotifOpen(false)
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

  // Tema do card conforme o plano: free=verde, essencial=azul, premium=dourado
  const planKey = ['premium', 'destaque'].includes(profile?.plan) ? 'premium'
    : profile?.plan === 'essencial' ? 'essencial' : 'free'
  const CARD_THEME = {
    free: {
      card: 'border border-emerald-400/40 ring-1 ring-emerald-300/10 shadow-[0_8px_30px_rgba(16,185,129,0.25)] bg-gradient-to-br from-emerald-600 via-emerald-700 to-green-900',
      glow: 'bg-emerald-400/10',
    },
    essencial: {
      card: 'border border-sky-400/40 ring-1 ring-sky-300/10 shadow-[0_8px_30px_rgba(56,189,248,0.25)] bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-900',
      glow: 'bg-sky-400/10',
    },
    premium: {
      card: 'border border-amber-300/50 ring-1 ring-amber-200/20 shadow-[0_8px_30px_rgba(245,158,11,0.3)] bg-gradient-to-br from-amber-500 via-amber-600 to-orange-800',
      glow: 'bg-amber-300/15',
    },
  }[planKey]
  const rating = liveRating?.avg ?? profile?.averageRating ?? 0
  const ratingCount = liveRating?.count ?? profile?.ratingCount ?? 0
  const specialties = Array.isArray(profile?.specialties)
    ? profile.specialties.join(', ')
    : (profile?.specialty || 'Não informado')

  return (
    <div className="page-container">
      {/* ── Topbar ─────────────────────────────────────────────── */}
      <div className="topbar">
        <span className="font-bold text-primary text-lg">Painel</span>
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
        <div className={`relative rounded-3xl p-5 text-white overflow-hidden ${CARD_THEME.card}`}>
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
              <p className="text-white/60 text-xs">CRMV {profile?.council || '—'}</p>
            </div>
            {(() => {
              const plan = profile?.plan || 'free'
              const cfg = {
                free:      { label: 'Free',     icon: '○', cls: 'bg-white/10 text-white/80 border border-white/20' },
                essencial: { label: 'Essencial', icon: '◆', cls: 'bg-sky-500/90 text-white border border-sky-300/40' },
                premium:   { label: 'Premium', icon: '★', cls: 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 border border-amber-200/50 shadow-lg shadow-amber-500/20' },
                destaque:  { label: 'Premium', icon: '★', cls: 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 border border-amber-200/50 shadow-lg shadow-amber-500/20' },
              }[plan] || { label: plan, icon: '○', cls: 'bg-white/10 text-white/80' }
              return (
                <Link to="/plans"
                  className={`flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-lg flex-shrink-0
                              self-start active:scale-95 transition-transform ${cfg.cls}`}>
                  <span className="text-[10px]">{cfg.icon}</span>
                  {cfg.label}
                </Link>
              )
            })()}
          </div>

          {/* Online toggle inside card */}
          <div className="relative bg-black/20 backdrop-blur-sm rounded-2xl px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-60" />}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOnline ? 'bg-green-400' : 'bg-white/40'}`} />
              </span>
              <span className="text-sm font-medium text-white/90">
                {isOnline ? 'Você está online' : 'Você está offline'}
              </span>
            </div>
            {updatingStatus
              ? <Spinner size={16} color="white" />
              : (
                <button
                  onClick={toggleOnline}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isOnline ? 'bg-green-400' : 'bg-white/25'}`}
                  aria-label="Alternar online"
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${isOnline ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              )
            }
          </div>
        </div>

        {/* ── Área de atuação ────────────────────────────────── */}
        <div className="card">
          <p className="text-xs text-gray-400 font-medium mb-1">Área de atuação</p>
          <p className="text-primary font-semibold text-sm leading-snug">{specialties}</p>
        </div>

        {/* ── Rating ─────────────────────────────────────────── */}
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
          <span className="text-3xl font-bold text-primary">{ratingCount > 0 ? Number(rating).toFixed(1) : '—'}</span>
          <Link to="/ratings" className="text-primary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* ── Atendimento Atual ──────────────────────────────── */}
        {activeRequests.length > 0 && (
          <div>
            <p className="text-base font-bold text-gray-800 mb-3">Atendimento Atual</p>
            <div className="flex flex-col gap-3">
              {activeRequests.slice(0, 2).map(r => {
                const s = normalizeStatus(r.status)
                const { label: sLabel, color: sColor } = ACTIVE_STATUS_LABEL[s] || { label: r.status, color: 'bg-gray-400 text-white' }
                return (
                  <div key={r.id} className="rounded-2xl bg-primary p-4 shadow-lg text-white">
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
                      onClick={() => navigate(`/request/${r.id}`)}
                      className="w-full bg-white/15 hover:bg-white/25 text-white font-semibold
                                 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors mb-2"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                      </svg>
                      Ir ao Atendimento
                    </button>

                    {/* Secondary actions */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => navigate(`/request/${r.id}`)}
                        className="bg-white/10 hover:bg-white/20 text-white text-sm font-medium
                                   py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
                        </svg>
                        Detalhes
                      </button>
                      <button
                        onClick={() => navigate(`/chat/${r.chatId || directChatId(r.clientId, r.professionalId)}`)}
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

        {/* ── Notificações push ──────────────────────────────── */}
        <EnablePushBanner
          uid={uid}
          message="Ative as notificações para receber cada nova solicitação na hora, mesmo com o app fechado."
        />

        {/* ── Ações Rápidas ──────────────────────────────────── */}
        <div>
          <p className="text-base font-bold text-gray-800 mb-3">Ações Rápidas</p>
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
                <span className="text-[10px] text-gray-400 -mt-1">tudo lido ✓</span>
              )}
            </Link>
          </div>
        </div>

        {/* ── Plano / monetização (some no Premium) ───────────── */}
        {!['premium', 'destaque'].includes(profile?.plan) && (
          <Link to="/plans"
            className="flex items-center gap-3 rounded-2xl p-4 bg-gradient-to-r from-amber-400 to-amber-500
                       shadow-[0_4px_16px_rgba(245,158,11,0.3)] hover:opacity-95 transition-all active:scale-[0.99]">
            <span className="text-2xl">⭐</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-sm">Seja Premium</p>
              <p className="text-white/85 text-xs">Apareça primeiro na busca e receba mais pedidos</p>
            </div>
            <svg className="w-5 h-5 text-white/80 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}

        {/* Anúncios — apenas para veterinários no plano Free */}
        {(!profile?.plan || profile?.plan === 'free') && (
          <AdBanner audience="vet" />
        )}

        {/* ── Resumo do Mês ──────────────────────────────────── */}
        <div>
          <p className="text-base font-bold text-gray-800 mb-3">Resumo do Mês</p>
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

        {/* ── Solicitações Pendentes ─────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-gray-800">Solicitações Pendentes</p>
              {pending.length > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                  {pending.length}
                </span>
              )}
            </div>
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
            <p className="text-base font-bold text-gray-800 mb-3">Próximos Atendimentos</p>
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
            className="border border-red-300 text-red-500 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50">
            Recusar
          </button>
          <button onClick={onAccept}
            className="bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-primary-600">
            Aceitar
          </button>
        </div>
      </div>
    </div>
  )
}
