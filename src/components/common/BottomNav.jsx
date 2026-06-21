import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import AIAssistant from '../client/AIAssistant'
import { isActive, isFinal } from '../../utils/status'

/* ─── Icons ──────────────────────────────────────────────────── */
const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
)
const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)
const RequestsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
)
const ReportsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
const ProfileIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)
const SearchIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
)
const HeartIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
  </svg>
)

/* ─── NavItem ─────────────────────────────────────────────────── */
function NavItem({ to, icon, label, badge, isDark }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center flex-1 py-2 gap-0.5 transition-colors min-w-0 ${
          isActive
            ? isDark ? 'text-green-400' : 'text-primary'
            : isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`relative transition-transform ${isActive ? 'scale-110' : ''}`}>
            {icon}
            {badge > 0 && (
              <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold
                               rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
          <span className="text-[10px] font-semibold tracking-wide truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}

/* ─── Vet (Professional) Bottom Nav ──────────────────────────── */
export function VetBottomNav() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const uid = user?.uid
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!uid) return
    const unsub = onSnapshot(
      query(
        collection(db, 'requests'),
        where('professionalId', '==', uid),
        where('professionalRead', '==', false)
      ),
      snap => setUnreadCount(snap.size),
      () => {}
    )
    return unsub
  }, [uid])

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl z-30
                    backdrop-blur-md border-t border-transparent flex items-stretch"
         style={{
           background: isDark ? 'rgba(22,32,22,0.95)' : 'rgba(255,255,255,0.92)',
           boxShadow: isDark ? '0 -2px 12px rgba(0,0,0,0.4)' : '0 -2px 12px rgba(0,0,0,0.07)',
           paddingBottom: 'env(safe-area-inset-bottom)',
           borderRadius: '20px 20px 0 0',
         }}>
      <NavItem to="/dashboard"        icon={<HomeIcon />}     label="Início"      isDark={isDark} />
      <NavItem to="/agenda"           icon={<CalendarIcon />} label="Agenda"      isDark={isDark} />
      <NavItem to="/pending-requests" icon={<RequestsIcon />} label="Pedidos"     badge={unreadCount} isDark={isDark} />
      <NavItem to="/reports"          icon={<ReportsIcon />}  label="Relatórios"  isDark={isDark} />
      <NavItem to="/edit-profile"     icon={<ProfileIcon />}  label="Perfil"      isDark={isDark} />
    </nav>
  )
}

/* ─── Client Bottom Nav ─────────────────────────────────────── */
export function ClientBottomNav() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const navigate = useNavigate()
  const uid = user?.uid
  const [aiOpen, setAiOpen] = useState(false)
  const [notifCount, setNotifCount] = useState(0)

  useEffect(() => {
    if (!uid) return

    const unsub = onSnapshot(
      query(collection(db, 'requests'), where('clientId', '==', uid)),
      snap => {
        const count = snap.docs.filter(d => {
          const r = d.data()
          const needsConfirm = isFinal(r.status) && !r.confirmFinish_client && !r.rated
          return needsConfirm || isActive(r.status)
        }).length
        setNotifCount(count)
      },
      () => {}
    )
    return unsub
  }, [uid])

  return (
    <>
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl z-30
                      backdrop-blur-md border-t border-transparent flex items-stretch"
           style={{
             background: isDark ? 'rgba(22,32,22,0.95)' : 'rgba(255,255,255,0.92)',
             boxShadow: isDark ? '0 -2px 12px rgba(0,0,0,0.4)' : '0 -2px 12px rgba(0,0,0,0.07)',
             paddingBottom: 'env(safe-area-inset-bottom)',
           }}>

        <NavItem to="/home"        icon={<SearchIcon />}   label="Buscar"  isDark={isDark} />
        <NavItem to="/my-requests" icon={<RequestsIcon />} label="Pedidos" badge={notifCount} isDark={isDark} />

        {/* IA — botão central elevado */}
        <button
          onClick={() => setAiOpen(true)}
          className="flex flex-col items-center justify-center flex-1 py-1.5 gap-0.5 min-w-0"
          aria-label="Assistente IA"
        >
          <span className="w-10 h-10 bg-primary rounded-full flex items-center justify-center
                           shadow-md active:scale-90 transition-all -mt-4 hover:bg-primary-600">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </span>
          <span className={`text-[10px] font-semibold tracking-wide ${isDark ? 'text-green-400' : 'text-primary'}`}>IA</span>
        </button>

        <NavItem to="/favorites"    icon={<HeartIcon />}   label="Favoritos" isDark={isDark} />
        <NavItem to="/edit-profile" icon={<ProfileIcon />} label="Perfil"    isDark={isDark} />
      </nav>

      <AIAssistant
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onBooking={() => navigate('/home')}
      />
    </>
  )
}
