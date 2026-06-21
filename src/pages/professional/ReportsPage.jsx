/**
 * ReportsPage — estatísticas do veterinário EM TEMPO REAL.
 * Tudo via onSnapshot: solicitações e avaliações atualizam os
 * gráficos na hora, sem precisar exportar nada.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { VetBottomNav } from '../../components/common/BottomNav'
import { DonutChart, BarChart, HBarList } from '../../components/common/Charts'
import Stars from '../../components/common/Stars'
import Spinner from '../../components/common/Spinner'
import { normalizeStatus, isActive } from '../../utils/status'
import { subMonths, format, isSameMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_COLORS = {
  finalizado: '#375337',
  ativo: '#3b82f6',
  pendente: '#f59e0b',
  rejeitado: '#ef4444',
}

export default function ReportsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const goTo = status => navigate(`/pending-requests?status=${status}`)
  const uid = user?.uid

  const [requests, setRequests] = useState(null)
  const [ratings, setRatings] = useState(null)

  useEffect(() => {
    if (!uid) return
    const unsubReq = onSnapshot(
      query(collection(db, 'requests'), where('professionalId', '==', uid)),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setRequests([])
    )
    const unsubRat = onSnapshot(
      collection(db, 'users', uid, 'ratings'),
      snap => setRatings(snap.docs.map(d => d.data())),
      () => setRatings([])
    )
    return () => { unsubReq(); unsubRat() }
  }, [uid])

  const stats = useMemo(() => {
    if (!requests) return null

    const byStatus = { finalizado: 0, ativo: 0, pendente: 0, rejeitado: 0 }
    const serviceCount = {}

    for (const r of requests) {
      const s = normalizeStatus(r.status)
      if (s === 'finalizado') byStatus.finalizado++
      else if (s === 'pendente') byStatus.pendente++
      else if (s === 'rejeitado') byStatus.rejeitado++
      else if (isActive(s) || s === 'aguardando') byStatus.ativo++
      if (r.service) serviceCount[r.service] = (serviceCount[r.service] || 0) + 1
    }

    // Últimos 6 meses
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => subMonths(now, 5 - i))
    const monthly = months.map(m => ({
      label: format(m, 'MMM', { locale: ptBR }),
      value: requests.filter(r => {
        const d = r.createdAt?.toDate?.()
        return d && isSameMonth(d, m)
      }).length,
    }))

    const topServices = Object.entries(serviceCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }))

    const completionBase = byStatus.finalizado + byStatus.rejeitado
    const completionRate = completionBase > 0
      ? Math.round((byStatus.finalizado / completionBase) * 100) : null

    return { byStatus, monthly, topServices, total: requests.length, completionRate }
  }, [requests])

  const ratingStats = useMemo(() => {
    if (!ratings) return null
    const count = ratings.length
    const avg = count ? ratings.reduce((s, r) => s + Number(r.rating || 0), 0) / count : 0
    const dist = [5, 4, 3, 2, 1].map(star => ({
      label: `${star} estrela${star > 1 ? 's' : ''}`,
      value: ratings.filter(r => Math.round(Number(r.rating)) === star).length,
    }))
    return { count, avg, dist }
  }, [ratings])

  const loading = !stats || !ratingStats

  return (
    <div className="page-container">
      <div className="topbar">
        <span className="font-bold text-primary text-lg">Relatórios</span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          Tempo real
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Spinner size={32} color="#375337" /></div>
      ) : (
        <div className="px-4 py-4 pb-nav stagger flex flex-col gap-4">

          {/* ── Visão geral ─────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard value={stats.total} label="Solicitações" sub="ver todas" onClick={() => goTo('todos')} />
            <StatCard value={stats.byStatus.finalizado} label="Atendimentos" sub="ver concluídos" onClick={() => goTo('finalizado')} />
            <StatCard
              value={stats.completionRate !== null ? `${stats.completionRate}%` : '—'}
              label="Conclusão" sub="dos decididos"
            />
          </div>

          {/* ── Pizza por status ─────────────────────────────── */}
          <div className="card">
            <CardTitle>Solicitações por status</CardTitle>
            {stats.total === 0
              ? <EmptyHint>Os gráficos aparecem com a primeira solicitação recebida.</EmptyHint>
              : (
                <DonutChart
                  centerLabel={stats.total}
                  centerSub="total"
                  data={[
                    { label: 'Finalizados', value: stats.byStatus.finalizado, color: STATUS_COLORS.finalizado },
                    { label: 'Em andamento', value: stats.byStatus.ativo, color: STATUS_COLORS.ativo },
                    { label: 'Pendentes', value: stats.byStatus.pendente, color: STATUS_COLORS.pendente },
                    { label: 'Recusados', value: stats.byStatus.rejeitado, color: STATUS_COLORS.rejeitado },
                  ].filter(d => d.value > 0)}
                />
              )}
          </div>

          {/* ── Acesso rápido por status ─────────────────────── */}
          <div className="card ">
            <CardTitle>Acesso rápido às solicitações</CardTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['pendente', 'Pendentes', stats.byStatus.pendente, 'text-amber-600 bg-amber-50'],
                ['ativo', 'Em andamento', stats.byStatus.ativo, 'text-blue-600 bg-blue-50'],
                ['finalizado', 'Finalizados', stats.byStatus.finalizado, 'text-primary bg-primary/10'],
                ['rejeitado', 'Recusados', stats.byStatus.rejeitado, 'text-red-500 bg-red-50'],
              ].map(([key, label, count, colors]) => (
                <button key={key} onClick={() => goTo(key)}
                  className={`rounded-xl py-3 px-2 text-center transition-all hover:opacity-80 active:scale-[0.97] ${colors}`}>
                  <p className="text-xl font-bold leading-none">{count}</p>
                  <p className="text-[11px] font-semibold mt-1">{label}</p>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-3">Toque em um status para abrir a lista — e em uma solicitação para ver os detalhes.</p>
          </div>

          {/* ── Barras por mês ───────────────────────────────── */}
          <div className="card">
            <CardTitle>Solicitações por mês</CardTitle>
            <BarChart data={stats.monthly} />
          </div>

          {/* ── Avaliações ───────────────────────────────────── */}
          <div className="card">
            <CardTitle>Suas avaliações</CardTitle>
            {ratingStats.count === 0
              ? <EmptyHint>Você ainda não recebeu avaliações.</EmptyHint>
              : (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-4xl font-bold text-gray-900">{ratingStats.avg.toFixed(1)}</span>
                    <div>
                      <Stars rating={ratingStats.avg} size={18} />
                      <p className="text-xs text-gray-400 mt-1">
                        {ratingStats.count} avaliaç{ratingStats.count > 1 ? 'ões' : 'ão'}
                      </p>
                    </div>
                  </div>
                  <HBarList data={ratingStats.dist} color="#f59e0b" />
                </>
              )}
          </div>

          {/* ── Serviços mais solicitados ────────────────────── */}
          {stats.topServices.length > 0 && (
            <div className="card">
              <CardTitle>Serviços mais solicitados</CardTitle>
              <HBarList data={stats.topServices} />
            </div>
          )}
        </div>
      )}

      <VetBottomNav />
    </div>
  )
}

function StatCard({ value, label, sub, onClick }) {
  return (
    <div onClick={onClick}
      className={`card py-4 px-2 flex flex-col items-center justify-center text-center gap-0.5 ${onClick ? 'cursor-pointer hover:shadow-card-hover active:scale-[0.98] transition-all' : ''}`}>
      <p className="text-3xl font-bold text-primary leading-none">{value}</p>
      <p className="text-[11px] font-semibold text-gray-700 mt-2 leading-tight">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 leading-tight">{sub}</p>}
    </div>
  )
}

function CardTitle({ children }) {
  return <p className="font-bold text-gray-800 text-sm mb-4">{children}</p>
}

function EmptyHint({ children }) {
  return <p className="text-xs text-gray-400 text-center py-6">{children}</p>
}
