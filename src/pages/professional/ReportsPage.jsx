/**
 * DesempenhoPage - como o veterinário está indo, AGORA.
 *
 * Não é um "relatório" para exportar: é um painel vivo (onSnapshot) que
 * responde em linguagem simples "como estou indo?". Por isso a página
 * abre com números grandes + comparação com o período anterior, seguidos
 * de frases prontas (Insights) antes de qualquer gráfico.
 *
 * Filtro de período recalcula TUDO, inclusive a janela anterior usada
 * para as variações (▲/▼).
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, query, where, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { VetBottomNav } from '../../components/common/BottomNav'
import { DonutChart, BarChart, HBarList, ProgressRing } from '../../components/common/Charts'
import Stars from '../../components/common/Stars'
import Spinner from '../../components/common/Spinner'
import { normalizeStatus, isActive } from '../../utils/status'
import { subMonths, subDays, format, isSameMonth, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_COLORS = {
  finalizado: '#375337',
  ativo: '#3b82f6',
  pendente: '#f59e0b',
  rejeitado: '#ef4444',
}

/* Períodos disponíveis. `days: null` = desde sempre. */
const PERIODS = [
  { key: 'mes',    label: 'Este mês', days: 30 },
  { key: 'tri',    label: '3 meses',  days: 90 },
  { key: 'ano',    label: '12 meses', days: 365 },
  { key: 'tudo',   label: 'Tudo',     days: null },
]

const brl = n => `R$ ${(Number(n) || 0).toFixed(2).replace('.', ',')}`

/** Data efetiva de um request (conclusão quando houver, senão criação). */
function dateOf(r) {
  return r.finalizedAt?.toDate?.() || r.createdAt?.toDate?.() || null
}

/** Receita reconhecida: orçamento enviado E aceito, atendimento concluído. */
function revenueOf(r) {
  if (normalizeStatus(r.status) !== 'finalizado') return 0
  if (!r.quote?.approvedAt) return 0
  return Number(r.quote?.total) || 0
}

/** Horas entre a criação e o primeiro "aceito" no histórico de status. */
function responseHours(r) {
  const created = r.createdAt?.toDate?.()
  if (!created) return null
  const accepted = (r.statusHistory || []).find(h => normalizeStatus(h.status) === 'aceito')
  if (!accepted?.at) return null
  const diff = new Date(accepted.at) - created
  return diff > 0 ? diff / 3600000 : null
}

export default function ReportsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const goTo = status => navigate(`/pending-requests?status=${status}`)
  const uid = user?.uid

  const [requests, setRequests] = useState(null)
  const [ratings, setRatings] = useState(null)
  const [plan, setPlan] = useState(null)
  const [monthlyGoal, setMonthlyGoal] = useState(0)
  // 'mensal' zera todo mês; 'fixa' é um alvo único que a receita de todos
  // os meses vai abatendo até fechar.
  const [goalType, setGoalType] = useState('mensal')
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const [goalTypeInput, setGoalTypeInput] = useState('mensal')
  const [period, setPeriod] = useState('mes')
  const isFree = !plan || plan === 'free'

  useEffect(() => {
    if (!uid) return
    const unsubPlan = onSnapshot(doc(db, 'users', uid), snap => {
      const d = snap.data() || {}
      setPlan(d.plan || 'free')
      setMonthlyGoal(d.monthlyGoal || 0)
      setGoalType(d.goalType === 'fixa' ? 'fixa' : 'mensal')
    }, () => setPlan('free'))
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
    return () => { unsubPlan(); unsubReq(); unsubRat() }
  }, [uid])

  const stats = useMemo(() => {
    if (!requests) return null
    const now = new Date()
    const cfg = PERIODS.find(p => p.key === period) || PERIODS[0]

    // Janela atual e janela anterior (mesmo tamanho) para as variações
    const from = cfg.days ? subDays(now, cfg.days) : null
    const prevFrom = cfg.days ? subDays(now, cfg.days * 2) : null
    const inWindow = r => { const d = dateOf(r); return d && (!from || d >= from) }
    const inPrev = r => {
      const d = dateOf(r)
      return d && prevFrom && d >= prevFrom && d < from
    }

    const cur = requests.filter(inWindow)
    const prev = cfg.days ? requests.filter(inPrev) : []

    const summarize = list => {
      const byStatus = { finalizado: 0, ativo: 0, pendente: 0, rejeitado: 0 }
      for (const r of list) {
        const s = normalizeStatus(r.status)
        if (s === 'finalizado') byStatus.finalizado++
        else if (s === 'pendente') byStatus.pendente++
        else if (s === 'rejeitado') byStatus.rejeitado++
        else if (isActive(s) || s === 'aguardando') byStatus.ativo++
      }
      const revenue = list.reduce((s, r) => s + revenueOf(r), 0)
      const paid = list.filter(r => revenueOf(r) > 0).length
      const decided = byStatus.finalizado + byStatus.rejeitado
      const times = list.map(responseHours).filter(h => h !== null)
      return {
        byStatus,
        total: list.length,
        revenue,
        ticket: paid > 0 ? revenue / paid : 0,
        completion: decided > 0 ? Math.round((byStatus.finalizado / decided) * 100) : null,
        avgResponse: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
      }
    }

    const c = summarize(cur)
    const p = summarize(prev)

    // Variação percentual entre janelas (null quando não há base de comparação)
    const delta = (a, b) => {
      if (!cfg.days || b === 0) return null
      return Math.round(((a - b) / b) * 100)
    }

    // Evolução: 6 meses (ou 12 em períodos longos)
    const nMonths = cfg.key === 'ano' || cfg.key === 'tudo' ? 12 : 6
    const monthly = Array.from({ length: nMonths }, (_, i) => subMonths(now, nMonths - 1 - i)).map(m => ({
      label: format(m, 'MMM', { locale: ptBR }),
      // Chave estável (2026-07) para abrir a lista já filtrada no mês tocado.
      key: format(m, 'yyyy-MM'),
      value: requests.filter(r => { const d = dateOf(r); return d && isSameMonth(d, m) }).length,
    }))

    // Rankings dentro da janela
    const tally = (list, key) => {
      const acc = {}
      for (const r of list) if (r[key]) acc[r[key]] = (acc[r[key]] || 0) + 1
      return Object.entries(acc).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))
    }
    const topServices = tally(cur, 'service').slice(0, 5)
    const topSpecies = tally(cur, 'petSpecies').slice(0, 6)

    // Receita do MÊS corrente - base da meta (independe do filtro)
    const monthRevenue = requests
      .filter(r => { const d = dateOf(r); return d && d >= startOfMonth(now) })
      .reduce((s, r) => s + revenueOf(r), 0)

    // Tudo que já entrou, sem recorte de período: é o que abate uma meta fixa.
    const totalRevenue = requests.reduce((s, r) => s + revenueOf(r), 0)

    return {
      ...c,
      totalRevenue,
      prev: p,
      delta: {
        revenue: delta(c.revenue, p.revenue),
        finalizado: delta(c.byStatus.finalizado, p.byStatus.finalizado),
        total: delta(c.total, p.total),
      },
      monthly, topServices, topSpecies, monthRevenue,
      periodLabel: cfg.label.toLowerCase(),
      comparable: !!cfg.days,
    }
  }, [requests, period])

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

  /* Frases prontas - a leitura rápida de "como estou indo". */
  const insights = useMemo(() => {
    if (!stats || !ratingStats) return []
    const out = []

    if (stats.comparable && stats.delta.finalizado !== null) {
      const d = stats.delta.finalizado
      out.push(d >= 0
        ? { icon: '📈', tone: 'good', text: `Você concluiu ${stats.byStatus.finalizado} atendimento${stats.byStatus.finalizado === 1 ? '' : 's'} - ${d}% a mais que no período anterior.` }
        : { icon: '📉', tone: 'warn', text: `Seus atendimentos caíram ${Math.abs(d)}% em relação ao período anterior. Ficar online com mais frequência ajuda a receber mais pedidos.` })
    } else if (stats.byStatus.finalizado > 0) {
      out.push({ icon: '✅', tone: 'good', text: `Você já concluiu ${stats.byStatus.finalizado} atendimento${stats.byStatus.finalizado === 1 ? '' : 's'}.` })
    }

    if (stats.byStatus.pendente > 0) {
      out.push({ icon: '⏰', tone: 'warn', text: `Você tem ${stats.byStatus.pendente} solicitaç${stats.byStatus.pendente === 1 ? 'ão' : 'ões'} esperando resposta. Responder rápido aumenta suas chances.` })
    }

    if (stats.avgResponse !== null) {
      const h = stats.avgResponse
      const txt = h < 1 ? `${Math.round(h * 60)} minutos` : `${h.toFixed(1)} horas`
      out.push(h <= 2
        ? { icon: '⚡', tone: 'good', text: `Você responde em média em ${txt}. Excelente - clientes valorizam agilidade.` }
        : { icon: '🕐', tone: 'warn', text: `Seu tempo médio de resposta é de ${txt}. Tente responder em até 2 horas.` })
    }

    if (stats.ticket > 0) {
      out.push({ icon: '💰', tone: 'neutral', text: `Seu ticket médio é de ${brl(stats.ticket)} por atendimento com orçamento aprovado.` })
    }

    if (stats.topServices.length > 0) {
      out.push({ icon: '🏆', tone: 'neutral', text: `Seu serviço mais pedido é "${stats.topServices[0].label}" (${stats.topServices[0].value}x).` })
    }

    if (ratingStats.count > 0) {
      out.push(ratingStats.avg >= 4.5
        ? { icon: '⭐', tone: 'good', text: `Sua nota média é ${ratingStats.avg.toFixed(1)} - você está entre os bem avaliados.` }
        : { icon: '⭐', tone: 'neutral', text: `Sua nota média é ${ratingStats.avg.toFixed(1)} em ${ratingStats.count} avaliação${ratingStats.count === 1 ? '' : 'ões'}.` })
    } else {
      out.push({ icon: '💬', tone: 'neutral', text: 'Você ainda não recebeu avaliações. Elas aparecem depois que o cliente confirma o atendimento.' })
    }

    return out
  }, [stats, ratingStats])

  async function saveGoal() {
    const val = parseFloat(goalInput.replace(',', '.'))
    if (isNaN(val) || val < 0) return
    try {
      await setDoc(doc(db, 'users', uid),
        { monthlyGoal: val, goalType: goalTypeInput, updatedAt: serverTimestamp() },
        { merge: true })
      setMonthlyGoal(val)
      setGoalType(goalTypeInput)
      setEditingGoal(false)
    } catch { /* ignore */ }
  }

  const loading = !stats || !ratingStats
  // Na meta fixa o progresso é o acumulado de todos os meses; na mensal,
  // só o que entrou no mês corrente.
  const metaFixa = goalType === 'fixa'
  const goalBase = metaFixa ? (stats?.totalRevenue || 0) : (stats?.monthRevenue || 0)
  const goalPct = monthlyGoal > 0 ? goalBase / monthlyGoal * 100 : 0
  const goalFalta = Math.max(0, monthlyGoal - goalBase)

  return (
    <div className="page-container">
      <div className="topbar">
        <span className="page-title">Desempenho</span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          Ao vivo
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><Spinner size={32} color="#375337" /></div>
      ) : (
        <div className="px-4 py-4 pb-nav flex flex-col gap-4">

          {/* ── Filtro de período ───────────────────────────── */}
          <div data-coach="perf-period" className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all active:scale-95 border ${
                  period === p.key
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-primary/40'
                }`}>
                {p.label}
              </button>
            ))}
          </div>

          {/* ── KPIs principais ─────────────────────────────── */}
          <div data-coach="perf-kpis" className="grid grid-cols-2 gap-3">
            <KpiTile
              value={brl(stats.revenue)} label="Receita"
              hint="orçamentos aprovados" delta={stats.delta.revenue} accent="text-primary"
            />
            <KpiTile
              value={stats.byStatus.finalizado} label="Atendimentos"
              hint="concluídos" delta={stats.delta.finalizado} accent="text-primary"
              onClick={() => goTo('finalizado')}
            />
            <KpiTile
              value={stats.completion !== null ? `${stats.completion}%` : '-'}
              label="Taxa de conclusão" hint="dos pedidos decididos" accent="text-blue-600"
            />
            <KpiTile
              value={ratingStats.count ? ratingStats.avg.toFixed(1) : '-'}
              label="Nota média"
              hint={ratingStats.count ? `${ratingStats.count} avaliação${ratingStats.count === 1 ? '' : 'ões'}` : 'sem avaliações'}
              accent="text-amber-500"
            />
          </div>

          {/* ── Meta do mês ─────────────────────────────────── */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="card-title">{metaFixa ? 'Meta fixa' : 'Meta do mês'}</p>
              <button onClick={() => {
                setGoalInput(String(monthlyGoal || ''))
                setGoalTypeInput(goalType)
                setEditingGoal(true)
              }}
                className="text-xs text-primary font-bold hover:underline">
                {monthlyGoal > 0 ? 'Alterar' : 'Definir meta'}
              </button>
            </div>

            {editingGoal ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['mensal', 'Todo mês', 'Zera no dia 1º e recomeça'],
                    ['fixa', 'Valor fixo', 'Some até fechar o total'],
                  ].map(([tipo, titulo, ajuda]) => (
                    <button key={tipo} type="button" onClick={() => setGoalTypeInput(tipo)}
                      className={`rounded-2xl border-2 px-3 py-2.5 text-left transition-all
                                  hover:-translate-y-px active:scale-[0.98] ${
                        goalTypeInput === tipo
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-primary/40'}`}>
                      <p className={`text-sm font-bold ${goalTypeInput === tipo ? 'text-primary' : 'text-gray-700'}`}>
                        {titulo}
                      </p>
                      <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{ajuda}</p>
                    </button>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="number" step="0.01" min="0" value={goalInput}
                    onChange={e => setGoalInput(e.target.value)}
                    placeholder="Ex: 5000" className="input-field flex-1" autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={saveGoal} className="btn-primary btn-sm flex-1">Salvar</button>
                    <button onClick={() => setEditingGoal(false)} className="btn-ghost btn-sm">Cancelar</button>
                  </div>
                </div>
              </div>
            ) : monthlyGoal > 0 ? (
              <div className="flex items-center gap-5">
                <ProgressRing
                  percent={goalPct}
                  label={`${Math.round(goalPct)}%`}
                  sub={goalPct >= 100 ? 'atingida!' : 'da meta'}
                  color={goalPct >= 100 ? '#22c55e' : '#375337'}
                />
                <div className="flex flex-col gap-2 min-w-0">
                  <div>
                    <p className="text-xs text-gray-500">
                      {metaFixa ? 'Recebido no total' : 'Recebido este mês'}
                    </p>
                    <p className="text-xl font-bold text-primary tabular-nums">{brl(goalBase)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{metaFixa ? 'Meta fixa' : 'Meta'}</p>
                    <p className="text-sm font-semibold text-gray-700 tabular-nums">{brl(monthlyGoal)}</p>
                  </div>
                  {goalPct < 100 && (
                    <p className="text-[11px] text-gray-500">Faltam {brl(goalFalta)}</p>
                  )}
                  <p className="text-[11px] text-gray-500 leading-snug">
                    {metaFixa
                      ? 'Somando a receita de todos os meses até fechar o valor.'
                      : 'Recomeça do zero a cada mês.'}
                  </p>
                </div>
              </div>
            ) : (
              <EmptyHint>Defina uma meta e acompanhe quanto falta para alcançá-la.</EmptyHint>
            )}
          </div>

          {/* ── Insights ────────────────────────────────────── */}
          {insights.length > 0 && (
            <div data-coach="perf-insights" className="card">
              <p className="card-title mb-3">O que isso significa</p>
              <div className="flex flex-col gap-2">
                {insights.map((it, i) => (
                  <div key={i}
                    className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${
                      it.tone === 'good' ? 'bg-green-50' : it.tone === 'warn' ? 'bg-amber-50' : 'bg-gray-50'
                    }`}>
                    <span className="text-base leading-none mt-0.5 flex-shrink-0">{it.icon}</span>
                    <p className="text-xs text-gray-700 leading-relaxed">{it.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Funil ───────────────────────────────────────── */}
          <div className="card">
            <p className="card-title mb-1">Do pedido ao atendimento</p>
            <p className="text-[11px] text-gray-400 mb-4">Como suas solicitações avançam - {stats.periodLabel}</p>
            <Funnel
              recebidas={stats.total}
              aceitas={stats.byStatus.finalizado + stats.byStatus.ativo}
              concluidas={stats.byStatus.finalizado}
            />
          </div>

          {/* ── Acesso rápido por status ────────────────────── */}
          <div className="card">
            <p className="card-title mb-3">Onde estão suas solicitações</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['pendente', 'Pendentes', stats.byStatus.pendente, 'text-amber-600 bg-amber-50'],
                ['ativo', 'Em andamento', stats.byStatus.ativo, 'text-blue-600 bg-blue-50'],
                ['finalizado', 'Concluídos', stats.byStatus.finalizado, 'text-primary bg-primary/10'],
                ['rejeitado', 'Recusados', stats.byStatus.rejeitado, 'text-red-500 bg-red-50'],
              ].map(([key, label, count, colors]) => (
                <button key={key} onClick={() => goTo(key)}
                  className={`rounded-2xl py-3 px-2 text-center transition-all hover:opacity-80 active:scale-[0.97] ${colors}`}>
                  <p className="text-2xl font-bold leading-none tabular-nums">{count}</p>
                  <p className="text-[11px] font-semibold mt-1.5">{label}</p>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-3">Toque em um status para abrir a lista.</p>
          </div>

          {/* ── Bloqueio Free ───────────────────────────────── */}
          {isFree && (
            <div className="card flex flex-col items-center text-center gap-3 py-7 border-2 border-dashed border-amber-200 bg-amber-50/40">
              <span className="text-4xl">🔒</span>
              <div>
                <p className="font-bold text-gray-800 text-sm">Análises detalhadas</p>
                <p className="text-xs text-gray-500 max-w-xs mt-1">
                  Evolução mensal, distribuição por status, espécies atendidas e
                  detalhes das avaliações fazem parte do plano <strong>Essencial</strong>.
                </p>
              </div>
              <button onClick={() => navigate('/plans')} className="btn-primary btn-sm px-6">
                Fazer upgrade
              </button>
            </div>
          )}

          {!isFree && <>
            {/* ── Evolução ──────────────────────────────────── */}
            <div className="card">
              <p className="card-title mb-4">Evolução dos atendimentos</p>
              <BarChart
                data={stats.monthly}
                onSelect={m => navigate(`/pending-requests?status=todos&mes=${m.key}`)}
              />
            </div>

            {/* ── Distribuição ──────────────────────────────── */}
            <div className="card">
              <p className="card-title mb-4">Distribuição por status</p>
              {stats.total === 0
                ? <EmptyHint>Aparece com a primeira solicitação recebida.</EmptyHint>
                : (
                  <DonutChart
                    centerLabel={stats.total}
                    centerSub="no período"
                    data={[
                      { label: 'Concluídos', value: stats.byStatus.finalizado, color: STATUS_COLORS.finalizado },
                      { label: 'Em andamento', value: stats.byStatus.ativo, color: STATUS_COLORS.ativo },
                      { label: 'Pendentes', value: stats.byStatus.pendente, color: STATUS_COLORS.pendente },
                      { label: 'Recusados', value: stats.byStatus.rejeitado, color: STATUS_COLORS.rejeitado },
                    ].filter(d => d.value > 0)}
                  />
                )}
            </div>

            {/* ── Avaliações ────────────────────────────────── */}
            <div className="card">
              <p className="card-title mb-4">Suas avaliações</p>
              {ratingStats.count === 0
                ? <EmptyHint>Você ainda não recebeu avaliações.</EmptyHint>
                : (
                  <>
                    <div className="flex items-center gap-4 mb-4">
                      <span className="text-4xl font-bold text-gray-900 tabular-nums">{ratingStats.avg.toFixed(1)}</span>
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

            {/* ── Rankings ──────────────────────────────────── */}
            {stats.topServices.length > 0 && (
              <div className="card">
                <p className="card-title mb-4">Serviços mais pedidos</p>
                <HBarList data={stats.topServices} />
              </div>
            )}
            {stats.topSpecies.length > 0 && (
              <div className="card">
                <p className="card-title mb-4">Espécies atendidas</p>
                <HBarList data={stats.topSpecies} color="#6366f1" />
              </div>
            )}
          </>}
        </div>
      )}

      <VetBottomNav />
    </div>
  )
}

/* ── Peças ────────────────────────────────────────────────────── */

/** Número grande + rótulo + variação vs período anterior. */
function KpiTile({ value, label, hint, delta, accent = 'text-primary', onClick }) {
  const up = delta !== null && delta !== undefined && delta >= 0
  return (
    <div onClick={onClick} className={onClick ? 'stat-tile-tap' : 'stat-tile'}>
      <div className="flex items-start justify-between gap-2">
        <p className={`stat-value ${accent}`}>{value}</p>
        {delta !== null && delta !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
            up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
          }`}>
            {up ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="stat-label">{label}</p>
      {hint && <p className="stat-hint">{hint}</p>}
    </div>
  )
}

/** Funil visual: recebidas → aceitas → concluídas, com conversão. */
function Funnel({ recebidas, aceitas, concluidas }) {
  const steps = [
    { label: 'Recebidas', value: recebidas, color: '#f59e0b' },
    { label: 'Aceitas', value: aceitas, color: '#3b82f6' },
    { label: 'Concluídas', value: concluidas, color: '#375337' },
  ]
  const max = Math.max(recebidas, 1)

  return (
    <div className="flex flex-col gap-3">
      {steps.map((s, i) => {
        const pct = (s.value / max) * 100
        const prev = i > 0 ? steps[i - 1].value : null
        const conv = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null
        return (
          <div key={s.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-semibold text-gray-700">{s.label}</span>
              <span className="flex items-center gap-2">
                {conv !== null && <span className="text-[10px] text-gray-400">{conv}% do anterior</span>}
                <span className="font-bold text-gray-800 tabular-nums">{s.value}</span>
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full"
                style={{ width: `${Math.max(pct, s.value > 0 ? 4 : 0)}%`, background: s.color, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EmptyHint({ children }) {
  return <p className="text-muted text-center py-6">{children}</p>
}
