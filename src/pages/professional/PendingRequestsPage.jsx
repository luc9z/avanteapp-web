/**
 * PendingRequestsPage → agora "Solicitações": TODOS os pedidos do
 * veterinário com filtros por status (chips), em tempo real.
 * Aceita deep-link ?status=pendente|ativo|finalizado|rejeitado
 * (usado pelos cartões clicáveis da tela de Relatórios).
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { VetBottomNav } from '../../components/common/BottomNav'
import Spinner from '../../components/common/Spinner'
import { normalizeStatus, statusInfo } from '../../utils/status'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function formatDate(ts) {
  const d = ts?.toDate ? ts.toDate() : null
  return d ? format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ''
}

function statusGroup(s) {
  const st = normalizeStatus(s)
  if (st === 'pendente') return 'pendente'
  if (st === 'finalizado') return 'finalizado'
  if (st === 'rejeitado') return 'rejeitado'
  return 'ativo'
}

export default function PendingRequestsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const initial = new URLSearchParams(location.search).get('status') || 'pendente'
  const [tab, setTab] = useState(initial)
  const [requests, setRequests] = useState(null)

  useEffect(() => {
    if (!user?.uid) return
    return onSnapshot(
      query(collection(db, 'requests'), where('professionalId', '==', user.uid)),
      snap => setRequests(
        snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0))
      ),
      () => setRequests([])
    )
  }, [user?.uid])

  const all = requests || []
  const counts = all.reduce((acc, r) => {
    const g = statusGroup(r.status)
    acc[g] = (acc[g] || 0) + 1
    return acc
  }, {})

  const FILTERS = [
    { key: 'todos',      label: 'Todos',        count: all.length },
    { key: 'pendente',   label: 'Pendentes',    count: counts.pendente || 0 },
    { key: 'ativo',      label: 'Em andamento', count: counts.ativo || 0 },
    { key: 'finalizado', label: 'Finalizados',  count: counts.finalizado || 0 },
    { key: 'rejeitado',  label: 'Recusados',    count: counts.rejeitado || 0 },
  ]

  const visible = tab === 'todos' ? all : all.filter(r => statusGroup(r.status) === tab)

  return (
    <div className="page-container">
      <div className="topbar">
        <Link to="/dashboard" className="text-primary" aria-label="Voltar">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="page-title">Solicitações</h1>
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
        {requests === null ? (
          <div className="flex justify-center py-16"><Spinner size={32} color="#375337" /></div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-gray-400 animate-fade-up">
            <svg className="w-14 h-14 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">
              {tab === 'todos' ? 'Nenhuma solicitação recebida ainda' : 'Nenhuma solicitação com este status'}
            </p>
          </div>
        ) : (
          <div className="responsive-grid-cards stagger">
            {visible.map(r => {
              const info = statusInfo(r.status)
              return (
                <div
                  key={r.id}
                  className="card cursor-pointer hover:shadow-card-hover transition-all active:scale-[0.99]"
                  onClick={() => navigate(`/request/${r.id}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="avatar-circle w-10 h-10 text-base flex-shrink-0">
                        {(r.clientName || '?')[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-sm truncate">{r.clientName || 'Cliente'}</p>
                        <p className="text-xs text-gray-400 truncate">{r.service}</p>
                      </div>
                    </div>
                    <span className={`${info.cls} ml-2 flex-shrink-0`}>{info.label}</span>
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-gray-400">
                    {r.petName && <p>🐾 {r.petName}{r.petSpecies ? ` · ${r.petSpecies}` : ''}</p>}
                    {r.location && <p className="truncate">📍 {r.location}</p>}
                    {r.urgency === 'urgent' && <p className="text-red-500 font-bold">🚨 Urgente</p>}
                    <p>{formatDate(r.createdAt)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <VetBottomNav />
    </div>
  )
}
