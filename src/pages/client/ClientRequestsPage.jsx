import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { ClientBottomNav } from '../../components/common/BottomNav'
import { normalizeStatus, precisaDoCliente } from '../../utils/status'
import RequestCard from '../../components/common/RequestCard'
import { carregarPerfis } from '../../services/perfis'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import OffersBanner from '../../components/client/OffersBanner'

// Base comum de todos os badges - só a cor muda por status.
const BADGE_BASE = 'text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap'
export default function ClientRequestsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const rawTab = new URLSearchParams(location.search).get('tab') || 'todos'
  const initialTab = { pendentes: 'pendente', historico: 'todos', favoritos: 'todos' }[rawTab] || rawTab
  const [tab, setTab] = useState(initialTab)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  // Foto de cada veterinário, por uid. A solicitação guarda só o nome,
  // e o rosto é o que faz o tutor reconhecer o atendimento na lista.
  const [fotos, setFotos] = useState({})

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

  // As fotos chegam depois da lista, para não atrasar a primeira pintura.
  useEffect(() => {
    const uids = requests.map(r => r.professionalId).filter(Boolean)
    if (!uids.length) return
    let vivo = true
    carregarPerfis(uids).then(perfis => {
      if (!vivo) return
      setFotos(f => ({
        ...f,
        ...Object.fromEntries(Object.entries(perfis).map(([uid, p]) => [uid, p.photoURL])),
      }))
    })
    return () => { vivo = false }
  }, [requests])

  // Filtros por status: cobre todo tipo de pedido, com contagem em cada chip.
  // (Favoritos saiu daqui - agora é a aba própria na navegação, focada em
  // veterinários e não em solicitações.)
  // Quantos esperam uma ação sua. É o mesmo número do contador na aba
  // "Pedidos" - os dois saem de precisaDoCliente(), então não divergem.
  const precisamDeVoce = all.filter(precisaDoCliente).length

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
    ...(precisamDeVoce > 0
      ? [{ key: 'acao', label: 'Precisa de você', count: precisamDeVoce }]
      : []),
    { key: 'todos',      label: 'Todos',         count: all.length },
    { key: 'pendente',   label: 'Pendentes',     count: counts.pendente || 0 },
    { key: 'ativo',      label: 'Em andamento',  count: counts.ativo || 0 },
    { key: 'finalizado', label: 'Finalizados',   count: counts.finalizado || 0 },
    { key: 'rejeitado',  label: 'Recusados',     count: counts.rejeitado || 0 },
  ]

  const visible = tab === 'todos' ? all : all.filter(r => {
    if (tab === 'acao') return precisaDoCliente(r)
    const st = normalizeStatus(r.status)
    if (tab === 'ativo') return !['pendente', 'finalizado', 'rejeitado'].includes(st)
    return st === tab
  })

  return (
    <div className="page-container">
      {/* Topo e filtros grudam JUNTOS. Antes o filtro usava top-[57px],
          mas a barra tem 61-65px, e mais no iPhone com entalhe: o filtro
          escorregava para baixo dela. */}
      <div className="sticky top-0 z-30">
        <div className="topbar">
          <button onClick={() => navigate(-1)} className="text-primary">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="page-title">Meus Pedidos</h1>
          <div className="w-6" />
        </div>
        {/* Filtros por status */}
        <div data-coach="req-filters" className="flex gap-2 px-4 py-3 overflow-x-auto bg-white border-b border-gray-100">
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
      </div>

      <div className="px-4 py-4 pb-nav">
        <OffersBanner className="mb-4" audience="client" />
        {loading && <div className="flex justify-center py-16"><Spinner size={32} color="#375337" /></div>}

        {!loading && (
          visible.length === 0
            ? <EmptyState text={tab === 'todos' ? 'Nenhum pedido ainda' : 'Nenhum pedido com este status'} />
            : <div className="responsive-grid-cards stagger">
                {visible.map(r => (
                  <RequestCard
                    key={r.id}
                    req={r}
                    perspectiva="client"
                    foto={fotos[r.professionalId]}
                    onClick={() => navigate(`/request/${r.id}`)}
                  />
                ))}
              </div>
        )}
      </div>
      <ClientBottomNav />
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
