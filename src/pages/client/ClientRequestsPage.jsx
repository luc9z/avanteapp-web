import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { ClientBottomNav } from '../../components/common/BottomNav'
import { normalizeStatus } from '../../utils/status'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import OffersBanner from '../../components/client/OffersBanner'

const STATUS_INFO = {
  pendente:     { label: 'Pendente',              cls: 'badge-pending' },
  aceito:       { label: 'Aceito',                cls: 'badge-accepted' },
  a_caminho:    { label: 'A Caminho',             cls: 'bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full' },
  em_andamento: { label: 'Em Andamento',          cls: 'bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full' },
  pausado:      { label: 'Em Pausa',              cls: 'bg-orange-100 text-orange-600 text-xs font-semibold px-2.5 py-1 rounded-full' },
  aguardando:   { label: 'Aguardando Confirmação', cls: 'bg-orange-100 text-orange-600 text-xs font-semibold px-2.5 py-1 rounded-full' },
  rejeitado:    { label: 'Rejeitado',             cls: 'badge-rejected' },
  finalizado:   { label: 'Finalizado',            cls: 'bg-gray-100 text-gray-600 text-xs font-semibold px-2.5 py-1 rounded-full' },
}

function formatDate(ts) {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return format(d, 'dd/MM/yyyy', { locale: ptBR })
}

export default function ClientRequestsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const rawTab = new URLSearchParams(location.search).get('tab') || 'todos'
  const initialTab = { pendentes: 'pendente', historico: 'todos', favoritos: 'todos' }[rawTab] || rawTab
  const [tab, setTab] = useState(initialTab)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const uid = user?.uid

  useEffect(() => {
    if (!uid) return
    const unsub = onSnapshot(
      query(collection(db, 'requests'), where('clientId', '==', uid)),
      snap => {
        setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      }
    )
    return unsub
  }, [uid])

  const all = [...requests].sort((a, b) => {
    const ta = a.createdAt?.toDate?.() || new Date(0)
    const tb = b.createdAt?.toDate?.() || new Date(0)
    return tb - ta
  })

  // Filtros por status: cobre todo tipo de pedido, com contagem em cada chip.
  // (Favoritos saiu daqui — agora é a aba própria na navegação, focada em
  // veterinários e não em solicitações.)
  const counts = all.reduce((acc, r) => {
    const st = normalizeStatus(r.status)
    const group = st === 'pendente' ? 'pendente'
      : st === 'finalizado' ? 'finalizado'
      : st === 'rejeitado' ? 'rejeitado'
      : 'ativo'
    acc[group] = (acc[group] || 0) + 1
    return acc
  }, {})

  const FILTERS = [
    { key: 'todos',      label: 'Todos',         count: all.length },
    { key: 'pendente',   label: 'Pendentes',     count: counts.pendente || 0 },
    { key: 'ativo',      label: 'Em andamento',  count: counts.ativo || 0 },
    { key: 'finalizado', label: 'Finalizados',   count: counts.finalizado || 0 },
    { key: 'rejeitado',  label: 'Recusados',     count: counts.rejeitado || 0 },
  ]

  const visible = tab === 'todos' ? all : all.filter(r => {
    const st = normalizeStatus(r.status)
    if (tab === 'ativo') return !['pendente', 'finalizado', 'rejeitado'].includes(st)
    return st === tab
  })

  return (
    <div className="page-container">
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-primary">Meus Pedidos</h1>
        <div className="w-6" />
      </div>

      {/* Filtros por status */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto bg-white sticky top-[57px] z-20 border-b border-gray-100">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setTab(f.key)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap
                        border transition-all flex-shrink-0 ${
              tab === f.key
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-white text-gray-500 border-gray-200 hover:border-primary/40'
            }`}
          >
            {f.label}
            <span className={`text-[10px] px-1.5 py-px rounded-full ${
              tab === f.key ? 'bg-white/20' : 'bg-gray-100 text-gray-400'
            }`}>{f.count}</span>
          </button>
        ))}
      </div>

      <div className="px-4 py-4 pb-nav">
        <OffersBanner className="mb-4" />
        {loading && <div className="flex justify-center py-16"><Spinner size={32} color="#375337" /></div>}

        {!loading && (
          visible.length === 0
            ? <EmptyState text={tab === 'todos' ? 'Nenhum pedido ainda' : 'Nenhum pedido com este status'} />
            : <div className="responsive-grid-cards stagger">
                {visible.map(r => <RequestItem key={r.id} req={r} />)}
              </div>
        )}
      </div>
      <ClientBottomNav />
    </div>
  )
}

function RequestItem({ req }) {
  const navigate = useNavigate()
  const status = normalizeStatus(req.status)
  const { label, cls } = STATUS_INFO[status] || { label: status, cls: 'badge-pending' }

  return (
    <div
      className="card cursor-pointer hover:shadow-card-hover transition-shadow"
      onClick={() => navigate(`/request/${req.id}`)}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="font-bold text-primary">{req.service}</p>
        <span className={cls}>{label}</span>
      </div>
      <p className="text-gray-500 text-sm">Para: {req.professionalName || '—'}</p>
      <p className="text-gray-400 text-xs mt-1">{formatDate(req.createdAt)}</p>
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <svg className="w-16 h-16 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <p>{text}</p>
    </div>
  )
}
