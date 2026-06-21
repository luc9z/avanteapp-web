import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  collection, query, where, orderBy, getDocs, limit, startAfter,
  onSnapshot, doc, getDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import Modal from '../../components/common/Modal'
import { showToast } from '../../components/common/Toast'
import { ClientBottomNav } from '../../components/common/BottomNav'
import ScheduleSheet from '../../components/client/ScheduleSheet'
import OffersBanner from '../../components/client/OffersBanner'
import { toggleFavorite } from '../../services/favorites'
import { openDirectChat } from '../../services/directChat'
import ProfCard, { isOnlineCheck, isFeatured } from '../../components/client/ProfCard'
import { friendlyError } from '../../utils/errors'
import { normalizeStatus, isActive } from '../../utils/status'
import { distanceKm } from '../../utils/geo'
import EnablePushBanner from '../../components/common/EnablePushBanner'
import { ThemeToggle } from '../../contexts/ThemeContext'

const SPECIALTIES = [
  'Pequenos animais', 'Bovinos', 'Equinos', 'Aves', 'Exóticos',
  'Cirurgia', 'Dermatologia', 'Oftalmologia',
]

export default function ClientHomePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid

  const [professionals, setProfessionals] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [lastDoc, setLastDoc] = useState(null)
  const [fetching, setFetching] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [onlyOnline, setOnlyOnline] = useState(false)
  const [myPos, setMyPos] = useState(null)        // "Perto de mim"
  const [locating, setLocating] = useState(false)
  const [selectedSpecialties, setSelectedSpecialties] = useState([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [tempSpecialties, setTempSpecialties] = useState([])

  const [onlineCount, setOnlineCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)


  const [pendingCount, setPendingCount] = useState(0)
  const [favorites, setFavorites] = useState([])
  const [totalReqCount, setTotalReqCount] = useState(0)
  const [activeRequests, setActiveRequests] = useState([])   // accepted/in-progress
  const [activeChats, setActiveChats] = useState([])         // chats with unread messages
  const [dismissedNotifs, setDismissedNotifs] = useState({})
  const [scheduleProf, setScheduleProf] = useState(null)     // vet selecionado p/ agendar

  const LIMIT = 20
  const useDocId = useRef(false)

  useEffect(() => { fetchPage(true) }, [selectedSpecialties])

  useEffect(() => {
    if (!uid) return

    // Subscribe to all client requests
    const unsub = onSnapshot(
      query(collection(db, 'requests'), where('clientId', '==', uid)),
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        const byNewest = (a, b) => {
          const ta = a.createdAt?.toDate?.() || new Date(0)
          const tb = b.createdAt?.toDate?.() || new Date(0)
          return tb - ta
        }
        setPendingCount(all.filter(r => normalizeStatus(r.status) === 'pendente').length)
        setTotalReqCount(all.length)

        // Finalizado aguardando confirmação do cliente (precisa de ação!)
        const needsConfirm = all.filter(r => {
          const s = (r.status || '').toLowerCase()
          const isFinal = ['finalizado', 'done', 'completed', 'aguardando_cliente'].includes(s)
          return isFinal && r.confirmFinish_client !== true && r.rated !== true
        }).sort(byNewest)

        // Pronto para avaliar (confirmado mas ainda não avaliado)
        const needsRating = all.filter(r => {
          const s = (r.status || '').toLowerCase()
          return ['finalizado', 'done', 'completed'].includes(s)
            && r.confirmFinish_client === true && r.rated !== true
        }).sort(byNewest)

        // Em andamento (aceito → pausado)
        const active = all.filter(r => isActive(r.status)).sort(byNewest)

        // marca cada item com seu tipo para renderização
        setActiveRequests([
          ...needsConfirm.map(r => ({ ...r, _kind: 'confirm' })),
          ...needsRating.map(r => ({ ...r, _kind: 'rate' })),
          ...active.map(r => ({ ...r, _kind: 'active' })),
        ])
      }
    )

    // Subscribe to chats — detect unread messages from professional
    const chatUnsub = onSnapshot(
      query(collection(db, 'chats'), where('clientId', '==', uid)),
      snap => {
        const chatsWithUnread = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => c.lastMessage && c.lastMessageSenderId && c.lastMessageSenderId !== uid)
        setActiveChats(chatsWithUnread)
      },
      () => {} // ignore permission errors
    )

    try {
      const saved = localStorage.getItem(`dn-${uid}`)
      if (saved) setDismissedNotifs(JSON.parse(saved))
    } catch {}

    getDoc(doc(db, 'users', uid)).then(snap => {
      const favs = snap.data()?.favorites
      setFavorites(Array.isArray(favs) ? favs : [])
    }).catch(() => {})

    return () => { unsub(); chatUnsub() }
  }, [uid])

  function dismissNotif(id, fingerprint) {
    setDismissedNotifs(prev => {
      const next = { ...prev, [id]: fingerprint }
      try { localStorage.setItem(`dn-${uid}`, JSON.stringify(next)) } catch {}
      return next
    })
  }

  async function fetchPage(refresh = false) {
    if (fetching) return
    setFetching(true)
    if (refresh) {
      setProfessionals([])
      setLastDoc(null)
      setHasMore(true)
      setLoading(true)
    }
    try {
      let q = query(
        collection(db, 'users'),
        where('profession', '==', 'medico_veterinario'),
      )
      if (selectedSpecialties.length > 0) {
        q = query(q, where('specialties', 'array-contains-any', selectedSpecialties))
      }

      let finalQuery
      try {
        finalQuery = refresh || !lastDoc
          ? query(q, orderBy('createdAt', 'desc'), limit(LIMIT))
          : query(q, orderBy('createdAt', 'desc'), limit(LIMIT), startAfter(lastDoc))
        const snap = await getDocs(finalQuery)
        processSnap(snap, refresh)
      } catch (_) {
        useDocId.current = true
        finalQuery = refresh || !lastDoc ? query(q, limit(LIMIT)) : query(q, limit(LIMIT), startAfter(lastDoc))
        const snap = await getDocs(finalQuery)
        processSnap(snap, refresh)
      }
    } catch (_) {}
    setFetching(false)
    setLoading(false)
  }

  function processSnap(snap, refresh) {
    const docs = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
    setProfessionals(prev => refresh ? docs : [...prev, ...docs])
    setLastDoc(snap.docs[snap.docs.length - 1] || null)
    setHasMore(snap.docs.length === LIMIT)
    const online = docs.filter(isOnlineCheck).length
    setOnlineCount(c => refresh ? online : c + online)
    setTotalCount(c => refresh ? docs.length : c + docs.length)
  }

  function handleScroll(e) {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && hasMore && !fetching) {
      fetchPage(false)
    }
  }

  // Destaque (plano pago) primeiro, depois quem está online
  function profDistance(p) {
    if (!myPos || p.baseLocation?.lat == null) return null
    return distanceKm(myPos.lat, myPos.lng, p.baseLocation.lat, p.baseLocation.lng)
  }

  function toggleNearMe() {
    if (myPos) return setMyPos(null)
    if (!navigator.geolocation) return showToast('GPS não suportado neste navegador', 'error')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false) },
      () => { setLocating(false); showToast('Não foi possível obter sua localização', 'error') },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Ordem: Favoritos do usuário → Destaque → perto → online → nota
  const sorted = [...professionals].sort((a, b) => {
    const va = favorites.includes(a.uid) ? 1 : 0, vb = favorites.includes(b.uid) ? 1 : 0
    if (va !== vb) return vb - va
    const fa = isFeatured(a) ? 1 : 0, fb = isFeatured(b) ? 1 : 0
    if (fa !== fb) return fb - fa
    if (myPos) {
      const da = profDistance(a), db2 = profDistance(b)
      if (da != null && db2 != null && da !== db2) return da - db2
      if (da != null && db2 == null) return -1
      if (da == null && db2 != null) return 1
    }
    const oa = isOnlineCheck(a) ? 1 : 0, ob = isOnlineCheck(b) ? 1 : 0
    if (oa !== ob) return ob - oa
    return Number(b.averageRating || 0) - Number(a.averageRating || 0)
  })

  const filtered = sorted.filter(d => {
    if (searchQuery) {
      const n = (d.name || '').toLowerCase()
      if (!n.includes(searchQuery.toLowerCase())) return false
    }
    if (selectedSpecialties.length > 0) {
      const sp = Array.isArray(d.specialties) ? d.specialties.join(' ').toLowerCase() : (d.specialty || '').toLowerCase()
      if (!selectedSpecialties.some(s => sp.includes(s.toLowerCase()))) return false
    }
    if (onlyOnline && !isOnlineCheck(d)) return false
    return true
  })

  async function handleMessage(prof) {
    try {
      const snap = await getDoc(doc(db, 'users', uid))
      const chatId = await openDirectChat(user, prof, snap.data()?.name)
      navigate(`/chat/${chatId}`)
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível abrir a conversa.'), 'error')
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  async function handleToggleFavorite(profUid) {
    const isFav = favorites.includes(profUid)
    setFavorites(prev => isFav ? prev.filter(id => id !== profUid) : [...prev, profUid])
    try {
      await toggleFavorite(uid, profUid, isFav)
    } catch {
      // desfaz a mudança otimista em caso de erro
      setFavorites(prev => isFav ? [...prev, profUid] : prev.filter(id => id !== profUid))
      showToast('Não foi possível atualizar favoritos', 'error')
    }
  }

  const [myName, setMyName] = useState('')
  useEffect(() => {
    if (!uid) return
    getDoc(doc(db, 'users', uid))
      .then(snap => { if (snap.exists() && snap.data().name) setMyName(snap.data().name) })
      .catch(() => {})
  }, [uid])
  const firstName = (myName || user?.displayName || '').split(' ')[0] || user?.email?.split('@')[0] || 'Usuário'

  return (
    <div className="page-container flex flex-col h-screen">
      {/* Topbar */}
      <div className="topbar flex-shrink-0">
        <Link to="/edit-profile" className="flex items-center gap-2 text-primary">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-sm">
            {firstName[0]?.toUpperCase()}
          </div>
          <span className="font-semibold text-sm">Olá, {firstName}</span>
        </Link>
        <ThemeToggle />
        <button onClick={handleLogout} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-full hover:bg-red-50">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>

      {/* Fixed header: green hero + search + filters */}
      <div className="flex-shrink-0">
        {/* Green hero — padronizado com o painel do veterinário */}
        <div className="bg-gradient-to-br from-primary-600 via-primary to-primary-700 px-4 pt-4 pb-5 rounded-b-3xl shadow-lg animate-fade-up">
          <h2 className="text-white text-lg font-bold leading-tight">Cuide do seu pet onde estiver</h2>
          <p className="text-white/70 text-xs mb-4">Veterinários a domicílio, prontos para atender</p>

          {/* Stats chips */}
          <div className="grid grid-cols-3 gap-2">
            <Link to="/my-requests?tab=pendentes" className="bg-white/10 rounded-xl p-2.5 hover:bg-white/20 transition-colors">
              <p className="text-2xl font-bold text-white leading-none">{pendingCount}</p>
              <p className="text-[11px] text-white/70 mt-1">Pendentes</p>
            </Link>
            <Link to="/favorites" className="bg-white/10 rounded-xl p-2.5 hover:bg-white/20 transition-colors">
              <p className="text-2xl font-bold text-white leading-none">{favorites.length}</p>
              <p className="text-[11px] text-white/70 mt-1">Favoritos</p>
            </Link>
            <Link to="/my-requests?tab=historico" className="bg-white/10 rounded-xl p-2.5 hover:bg-white/20 transition-colors">
              <p className="text-2xl font-bold text-white leading-none">{totalReqCount}</p>
              <p className="text-[11px] text-white/70 mt-1">Histórico</p>
            </Link>
          </div>
        </div>

        {/* Search + filters */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative mb-2.5">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar veterinário"
              className="input-field pl-10"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnlyOnline(!onlyOnline)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex-shrink-0 ${
                onlyOnline
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-primary/50'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${onlyOnline ? 'bg-green-300' : 'bg-gray-400'}`} />
              Online
            </button>
            <button
              onClick={toggleNearMe}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex-shrink-0 ${
                myPos
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {locating ? 'Localizando...' : 'Perto de mim'}
            </button>
            <button
              onClick={() => { setTempSpecialties([...selectedSpecialties]); setFilterOpen(true) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all flex-shrink-0 ${
                selectedSpecialties.length > 0
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-primary/50'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              {selectedSpecialties.length > 0 ? `${selectedSpecialties.length} filtro${selectedSpecialties.length > 1 ? 's' : ''}` : 'Filtrar'}
            </button>
            <span className="ml-auto text-xs text-gray-400 flex-shrink-0">
              <span className="text-green-600 font-semibold">{onlineCount}</span>/{totalCount} online
            </span>
          </div>
        </div>
      </div>

      {/* Scroll area: ofertas + atualizações + lista de profissionais */}
      <div className="flex-1 overflow-y-auto px-4 pb-nav" onScroll={handleScroll}>
        <div className="pt-2">
          <EnablePushBanner
            uid={uid}
            message="Ative as notificações para saber na hora quando o veterinário aceitar seu pedido."
          />
          <OffersBanner />
        </div>
        {/* Atualizações */}
        {(activeRequests.some(r => dismissedNotifs[`req-${r.id}`] !== r._kind + r.status) ||
          activeChats.some(c => dismissedNotifs[`chat-${c.id}`] !== c.lastMessage)) && (
          <div className="pt-3 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 bg-primary rounded-full" />
              <p className="text-sm font-bold text-gray-700">Atualizações</p>
            </div>

            {activeChats
              .filter(c => dismissedNotifs[`chat-${c.id}`] !== c.lastMessage)
              .map(chat => (
                <NotifCard
                  key={`chat-${chat.id}`}
                  accent="primary"
                  icon="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  title="Nova mensagem"
                  subtitle={chat.lastMessage}
                  pulse
                  onClick={() => navigate(`/chat/${chat.id}`)}
                  onDismiss={() => dismissNotif(`chat-${chat.id}`, chat.lastMessage)}
                />
              ))}

            {activeRequests
              .filter(r => dismissedNotifs[`req-${r.id}`] !== r._kind + r.status)
              .map(r => {
                const cfg = notifConfig(r)
                return (
                  <NotifCard
                    key={`req-${r.id}`}
                    accent={cfg.accent}
                    icon={cfg.icon}
                    title={cfg.title}
                    subtitle={cfg.subtitle}
                    cta={cfg.cta}
                    onClick={() => navigate(cfg.to(r))}
                    onDismiss={() => dismissNotif(`req-${r.id}`, r._kind + r.status)}
                  />
                )
              })}
          </div>
        )}

        {/* Professionals heading */}
        <div className="flex items-center gap-2 pt-4 pb-2">
          <span className="w-1.5 h-4 bg-primary rounded-full" />
          <p className="text-sm font-bold text-gray-700">Veterinários disponíveis</p>
        </div>

        {loading && (
          <div className="flex justify-center py-16"><Spinner size={32} color="#375337" /></div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>{professionals.length === 0 ? 'Nenhum profissional encontrado' : 'Nenhum resultado para sua busca'}</p>
          </div>
        )}

        {!loading && (
          <div className="responsive-grid-2 pb-2 stagger">
            {filtered.map(d => (
              <ProfCard
                key={d.uid}
                prof={d}
                distanceKm={profDistance(d)}
                isFavorite={favorites.includes(d.uid)}
                onToggleFavorite={() => handleToggleFavorite(d.uid)}
                onMessage={() => handleMessage(d)}
                onView={() => navigate(`/professional/${d.uid}`)}
                onRequest={() => setScheduleProf(d)}
              />
            ))}
          </div>
        )}

        {fetching && !loading && (
          <div className="flex justify-center py-4"><Spinner size={24} color="#375337" /></div>
        )}
      </div>

      {/* Filter modal */}
      <Modal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filtrar por especialidade"
        footer={
          <>
            <button
              onClick={() => setTempSpecialties([])}
              className="px-4 py-2 text-gray-500 text-sm font-medium hover:text-gray-700"
            >
              Limpar
            </button>
            <button
              onClick={() => { setSelectedSpecialties(tempSpecialties); setFilterOpen(false); fetchPage(true) }}
              className="btn-primary px-6 py-2"
            >
              Aplicar{tempSpecialties.length > 0 ? ` (${tempSpecialties.length})` : ''}
            </button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto py-1">
          {SPECIALTIES.map(s => {
            const active = tempSpecialties.includes(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => setTempSpecialties(prev =>
                  active ? prev.filter(x => x !== s) : [...prev, s]
                )}
                className={`px-3.5 py-2 rounded-full text-xs font-semibold border transition-all ${
                  active
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-primary'
                }`}
              >
                {active && '✓ '}{s}
              </button>
            )
          })}
        </div>
      </Modal>

      <ClientBottomNav />

      <ScheduleSheet
        open={!!scheduleProf}
        professional={scheduleProf}
        user={user}
        onClose={() => setScheduleProf(null)}
      />

    </div>
  )
}

/* ── Notification config per request kind/status ─────────────── */
function notifConfig(r) {
  const prof = r.professionalName || 'Profissional'

  if (r._kind === 'confirm') {
    return {
      accent: 'orange',
      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      title: 'Confirme seu atendimento',
      subtitle: `${prof} encerrou o atendimento. Toque para confirmar.`,
      cta: 'Confirmar',
      to: (x) => `/request/${x.id}`,
    }
  }
  if (r._kind === 'rate') {
    return {
      accent: 'yellow',
      icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.05 9.901c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
      title: 'Avalie o atendimento',
      subtitle: `Como foi com ${prof}?`,
      cta: 'Avaliar',
      to: (x) => `/rate/${x.id}`,
    }
  }

  // active
  const s = (r.status || '').toLowerCase()
  const map = {
    aceito:       { accent: 'green',  icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Pedido aceito!', subtitle: `${prof} aceitou sua solicitação` },
    accepted:     { accent: 'green',  icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Pedido aceito!', subtitle: `${prof} aceitou sua solicitação` },
    a_caminho:    { accent: 'blue',   icon: 'M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM3 8h14l-1 7H4L3 8z', title: 'A caminho', subtitle: `${prof} está indo até você` },
    em_andamento: { accent: 'blue',   icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2', title: 'Em atendimento', subtitle: r.service },
    pausado:      { accent: 'orange', icon: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z', title: 'Atendimento pausado', subtitle: r.service },
  }
  const c = map[s] || { accent: 'gray', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', title: r.service, subtitle: prof }
  return { ...c, cta: 'Ver', to: (x) => `/request/${x.id}` }
}

const NOTIF_ACCENTS = {
  primary: { bg: 'bg-primary',      icon: 'text-white',       ring: 'bg-white/20',     card: 'bg-primary text-white',          sub: 'text-white/70',   arrow: 'text-white/60' },
  green:   { bg: 'bg-green-100',    icon: 'text-green-600',   ring: 'bg-green-100',    card: 'bg-white border border-gray-100', sub: 'text-gray-500', arrow: 'text-gray-300' },
  blue:    { bg: 'bg-blue-100',     icon: 'text-blue-600',    ring: 'bg-blue-100',     card: 'bg-white border border-gray-100', sub: 'text-gray-500', arrow: 'text-gray-300' },
  orange:  { bg: 'bg-orange-100',   icon: 'text-orange-600',  ring: 'bg-orange-100',   card: 'bg-white border border-orange-200', sub: 'text-gray-500', arrow: 'text-gray-300' },
  yellow:  { bg: 'bg-yellow-100',   icon: 'text-yellow-600',  ring: 'bg-yellow-100',   card: 'bg-white border border-yellow-200', sub: 'text-gray-500', arrow: 'text-gray-300' },
  gray:    { bg: 'bg-gray-100',     icon: 'text-gray-500',    ring: 'bg-gray-100',     card: 'bg-white border border-gray-100', sub: 'text-gray-500', arrow: 'text-gray-300' },
}

function NotifCard({ accent = 'gray', icon, title, subtitle, cta, pulse, onClick, onDismiss }) {
  const a = NOTIF_ACCENTS[accent] || NOTIF_ACCENTS.gray
  const isPrimary = accent === 'primary'
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left shadow-sm cursor-pointer
                  hover:shadow-card transition-all active:scale-[0.98] ${a.card}`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${a.ring}`}>
        <svg className={`w-5 h-5 ${a.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-bold text-sm ${isPrimary ? 'text-white' : 'text-gray-800'}`}>{title}</p>
        <p className={`text-xs truncate mt-0.5 ${a.sub}`}>{subtitle}</p>
      </div>
      {cta && !isPrimary && (
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0 ${
          accent === 'orange' ? 'bg-orange-500 text-white'
          : accent === 'yellow' ? 'bg-yellow-400 text-white'
          : accent === 'green' ? 'bg-green-500 text-white'
          : 'bg-primary text-white'
        }`}>
          {cta}
        </span>
      )}
      {pulse && <span className="w-2.5 h-2.5 bg-green-400 rounded-full flex-shrink-0 animate-pulse" />}
      {!cta && !pulse && (
        <svg className={`w-4 h-4 flex-shrink-0 ${a.arrow}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
      {onDismiss && (
        <button
          onClick={e => { e.stopPropagation(); onDismiss() }}
          className={`ml-1 p-1 rounded-full flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity
                      ${isPrimary ? 'hover:bg-white/20 text-white' : 'hover:bg-gray-100 text-gray-400'}`}
          aria-label="Descartar notificação"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
