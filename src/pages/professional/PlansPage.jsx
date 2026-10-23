/**
 * PlansPage - planos do veterinário, estilo "premium" (referência: X/Twitter).
 * Cards escuros lado a lado, toggle Mensal/Anual (anual = 2 meses grátis),
 * selo "Melhor valor", cupom e barra fixa de pagamento via AbacatePay.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { doc, onSnapshot, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../../firebase'
import { chamarServidor } from '../../services/servidor'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { showToast } from '../../components/common/Toast'
import { DEFAULT_PLANS } from '../admin/AdminPage'
import { VetBottomNav } from '../../components/common/BottomNav'
import { useTheme } from '../../contexts/ThemeContext'
import AvanteLogo from '../../components/common/AvanteLogo'
import { countPaidVisits, FUNDADOR_TRIAL_VISITS, FUNDADOR_PRICE, FUNDADOR_SLOTS } from '../../utils/paidVisits'


const brl = v => Number(v) <= 0 ? 'Grátis' : `R$ ${Number(v).toFixed(2).replace('.', ',')}`

function Check({ locked }) {
  return locked ? (
    <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-white/25" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ) : (
    <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

/** Igual a JANELA_RENOVACAO_DIAS em functions/pagamentos.js. */
const JANELA_RENOVACAO = 5

export default function PlansPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const pageBg = isDark ? '#0e1410' : '#1e3a1e'
  const barBg = isDark ? 'rgba(10,15,11,0.92)' : 'rgba(22,45,22,0.95)'
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const onboarding = searchParams.get('onboarding') === '1'

  const [plans, setPlans] = useState(null)
  const [currentPlan, setCurrentPlan] = useState(null)
  const [selectedId, setSelectedId] = useState('premium')
  // Quem já tem plano chega com ele marcado, não com o Premium fixo.
  const [tocouNaSelecao, setTocouNaSelecao] = useState(false)
  const [period, setPeriod] = useState('mensal') // mensal | anual
  const [coupon, setCoupon] = useState('')
  const [couponBusy, setCouponBusy] = useState(false)
  // Cupom de desconto parcial já validado: vai junto no checkout.
  const [cupomParcial, setCupomParcial] = useState(null)   // { code, discount }
  const [paying, setPaying] = useState(false)
  // Até quando o plano pago vale. Sem data: Free ou plano de cupom.
  const [validade, setValidade] = useState(null)
  // Vet Fundador: dados da conta, vagas (config/fundador) e atendimentos feitos.
  const [eu, setEu] = useState(null)
  const [vagasFundador, setVagasFundador] = useState(null)   // { vagas, usados, fechaEm }
  const [atendimentos, setAtendimentos] = useState(0)
  const [entrando, setEntrando] = useState(false)

  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'plans'),
      snap => setPlans(snap.exists() && Array.isArray(snap.data().plans) ? snap.data().plans : DEFAULT_PLANS),
      () => setPlans(DEFAULT_PLANS)
    )
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    return onSnapshot(doc(db, 'users', user.uid), snap => {
      const p = snap.data()?.plan || null
      setEu(snap.data() || null)
      setCurrentPlan(p)
      setValidade(snap.data()?.planExpiresAt?.toDate?.() || null)
      if (p && !tocouNaSelecao) setSelectedId(p)
    }, () => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'fundador'),
      snap => setVagasFundador(snap.exists() ? snap.data() : {}), () => setVagasFundador({}))
  }, [])

  // A meta conta na hora aqui; o servidor confere de novo na tarefa diária.
  useEffect(() => {
    if (!user?.uid || !eu?.fundador || eu?.fundadorTrialEndedAt) return
    getDocs(query(collection(db, 'requests'), where('professionalId', '==', user.uid)))
      .then(s => setAtendimentos(countPaidVisits(s.docs.map(d => d.data()), Date.now(), eu.fundador.desde)))
      .catch(() => {})
  }, [user?.uid, eu?.fundador, eu?.fundadorTrialEndedAt])

  useEffect(() => {
    if (searchParams.get('status') === 'paid') {
      showToast('Pagamento em processamento! Seu plano ativa em instantes.', 'success')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Voltar do checkout pelo botão do navegador restaura a página antiga da
  // memória (bfcache): botão girando e plano desatualizado. Recarrega.
  useEffect(() => {
    const aoVoltar = e => { if (e.persisted) window.location.reload() }
    window.addEventListener('pageshow', aoVoltar)
    return () => window.removeEventListener('pageshow', aoVoltar)
  }, [])

  const selected = useMemo(
    () => (plans || []).find(p => p.id === selectedId) || null,
    [plans, selectedId]
  )

  // Mesmo plano em vigor não se paga de novo: a renovação só abre nos
  // últimos JANELA_RENOVACAO dias. Plano de cupom (sem vencimento) nunca.
  // O servidor confere igual (functions/pagamentos.js, podePagar).
  const renovaAPartirDe = validade ? new Date(validade.getTime() - JANELA_RENOVACAO * 864e5) : null
  const mesmoPlanoTravado = !!selected && selected.id === currentPlan
    && (!validade || Date.now() < renovaAPartirDe.getTime())

  // Vet Fundador. O preço travado vale para o Premium MENSAL depois do
  // período grátis, por 12 meses (o servidor aplica; aqui só mostra).
  const fundador = eu?.fundador || null
  const fimDoTeste = eu?.fundadorTrialEndedAt?.toDate?.() || null
  const travadoAte = fimDoTeste
    ? new Date(fimDoTeste.getTime() + Number(fundador?.mesesTravado || 12) * 30 * 864e5) : null
  const precoFundador = fundador && travadoAte && Date.now() <= travadoAte.getTime()
    ? Number(fundador.price || FUNDADOR_PRICE) : null
  const metaFundador = Number(fundador?.trialVisits || FUNDADOR_TRIAL_VISITS)
  const vagas = Number(vagasFundador?.vagas ?? FUNDADOR_SLOTS)
  const vagasRestantes = Math.max(0, vagas - Number(vagasFundador?.usados ?? 0))
  const fechaEm = vagasFundador?.fechaEm?.toDate?.() || null
  const inscricoesFechadas = !!fechaEm && Date.now() > fechaEm.getTime()
  const temPlanoPagoEmVigor = !!currentPlan && currentPlan !== 'free' && !!validade && validade.getTime() > Date.now()
  const mostrarConvite = vagasFundador !== null && !fundador && !temPlanoPagoEmVigor
    && vagasRestantes > 0 && !inscricoesFechadas
  const reais = v => Number(v).toFixed(2).replace('.', ',')

  async function entrarNoFundador() {
    setEntrando(true)
    try {
      await chamarServidor('/fundador', {})
      showToast('Você é Vet Fundador! Seu Premium já está ativo.', 'success')
    } catch (e) {
      if (import.meta.env.DEV) console.error(e)
      showToast(e?.message || 'Não foi possível entrar agora. Tente de novo.', 'error')
    } finally { setEntrando(false) }
  }

  // Anual = 12 meses pelo preço de 10 (2 meses grátis)
  const priceFor = p => (precoFundador != null && p.id === 'premium' && period === 'mensal')
    ? precoFundador
    : period === 'anual' ? p.price * 10 : p.price
  const periodLabel = period === 'anual' ? '/ano' : '/mês'

  /** Servidor não configurado ou fora do ar (Worker ainda não publicado). */
  const servidorAusente = e => e?.codigo === 'indisponivel'

  async function handleRedeemCoupon() {
    const code = coupon.trim().toUpperCase()
    if (!code) return showToast('Digite o código do cupom', 'error')
    if (!selectedId) return showToast('Selecione um plano primeiro.', 'error')
    if (mesmoPlanoTravado) return showToast('Este já é o seu plano atual.', 'error')
    setCouponBusy(true)
    try {
      // O servidor valida o cupom: a lista de cupons não é legível pelo app.
      const data = await chamarServidor('/cupom', { planId: selectedId, code })
      if (data?.activated) {
        showToast(`Cupom ${code} aplicado, plano ativado!`, 'success')
        setTimeout(() => navigate('/dashboard', { replace: true }), 900)
      } else if (data?.discount > 0) {
        setCupomParcial({ code, discount: data.discount })
        showToast(`Cupom válido: ${data.discount}% de desconto no pagamento.`, 'success')
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error(e)
      showToast(e?.codigo === 'nao-encontrado' ? 'Cupom inválido ou expirado.'
        : e?.codigo === 'ja-ativo' ? e.message
        : 'Não foi possível validar o cupom agora. Tente de novo.', 'error')
    } finally { setCouponBusy(false) }
  }

  async function handlePay() {
    if (!selected) return
    if (mesmoPlanoTravado) return
    setPaying(true)
    try {
      if (selected.price <= 0) {
        await setDoc(doc(db, 'users', user.uid), {
          plan: selected.id,
          // featured é consequência do plano. Sem reescrever aqui, quem
          // saía do Premium continuava com o selo de Destaque na busca.
          featured: false,
          planActivatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
        showToast(`Plano ${selected.name} ativado!`, 'success')
        setTimeout(() => navigate('/dashboard', { replace: true }), 800)
        return
      }

      // Valor, período e vencimento são decididos no servidor. Daqui só
      // vai a escolha; a confirmação chega pelo webhook da AbacatePay.
      const data = await chamarServidor('/checkout', {
        planId: selected.id,
        period,
        origin: window.location.origin,
        ...(cupomParcial && { coupon: cupomParcial.code }),
      })
      if (!data?.url) throw new Error('sem endereço de pagamento')
      window.location.assign(data.url)
    } catch (e) {
      if (import.meta.env.DEV) console.error(e)
      showToast(servidorAusente(e)
        ? 'O pagamento ainda não está disponível. Tente mais tarde ou use um cupom.'
        : e?.codigo && e.message ? e.message
        : 'Não foi possível iniciar o pagamento.', 'error')
      setPaying(false)
    }
  }

  return (
    <div className="min-h-screen min-h-dvh" style={{ background: pageBg }}>
      {/* No desktop os tres planos cabem lado a lado com folga. */}
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 pb-44 lg:pb-20">

        {/* Topo */}
        <div className="flex items-center justify-between py-4">
          <button onClick={() => navigate(onboarding ? '/dashboard' : -1)}
            className="text-white/60 hover:text-white p-2 -ml-2 transition-colors" aria-label="Voltar">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {onboarding && (
            <button onClick={() => navigate('/dashboard', { replace: true })}
              className="text-xs text-white/40 hover:text-white/70 underline transition-colors">
              Decidir depois
            </button>
          )}
        </div>

        {/* Header */}
        <div className="flex flex-col items-center text-center gap-4 pt-2 pb-7 animate-fade-up">
          <AvanteLogo className="w-14 h-14 text-white opacity-95" />
          <h1 className="text-white font-bold text-2xl sm:text-3xl">
            {onboarding ? 'Escolha seu plano para começar' : 'Evolua seu perfil no AVANTE'}
          </h1>

          {/* Toggle Mensal/Anual */}
          <div className="relative mt-1">
            <div className="flex bg-white/[0.07] border border-white/10 rounded-full p-1">
              {[['mensal', 'Mensalmente'], ['anual', 'Anual']].map(([id, label]) => (
                <button key={id} onClick={() => setPeriod(id)}
                  className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                    period === id ? 'bg-white text-gray-900' : 'text-white/50 hover:text-white/80'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            {period !== 'anual' && (
              <span className="absolute -bottom-3 right-0 translate-x-3 bg-emerald-500 text-white text-[10px]
                               font-bold px-2.5 py-1 rounded-full shadow-lg pointer-events-none">
                2 meses grátis
              </span>
            )}
          </div>
        </div>

        {/* ── Vet Fundador ───────────────────────────────────
             Antes da escada de planos: para quem ainda não assina, é a
             oferta que o painel de veterinários pediu (não pagar nada
             antes de o app trazer cliente). */}
        {mostrarConvite && (
          <div className="mb-6 rounded-2xl border-2 border-amber-400/60 bg-amber-400/[0.08] p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-amber-300 text-xs font-bold uppercase tracking-wide">Vet Fundador</p>
              <span className="text-[11px] font-bold text-amber-200 bg-amber-400/15 rounded-full px-2.5 py-1">
                {vagasRestantes} {vagasRestantes === 1 ? 'vaga restante' : 'vagas restantes'}
              </span>
            </div>
            <p className="text-white font-bold text-lg leading-snug">
              Premium grátis até você concluir {FUNDADOR_TRIAL_VISITS} atendimentos pelo app.
            </p>
            <p className="text-white/70 text-sm leading-relaxed">
              Depois, R$ {reais(FUNDADOR_PRICE)} por mês, travado por 12 meses. Sem comissão sobre
              a visita e sem cartão agora. Conta como atendimento o pedido finalizado e confirmado
              pelo cliente.
            </p>
            <button onClick={entrarNoFundador} disabled={entrando}
              className="self-start bg-amber-400 text-gray-900 font-bold rounded-full px-6 min-h-[44px] text-sm
                         hover:bg-amber-300 disabled:opacity-60 transition-all">
              {entrando ? <Spinner size={16} /> : 'Quero ser Vet Fundador'}
            </button>
          </div>
        )}

        {fundador && !fimDoTeste && (
          <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-400/[0.06] p-4 flex flex-col gap-2">
            <p className="text-amber-300 text-xs font-bold uppercase tracking-wide">Você é Vet Fundador</p>
            <p className="text-white font-bold">
              {Math.min(atendimentos, metaFundador)} de {metaFundador} atendimentos concluídos pelo app
            </p>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full transition-all"
                style={{ width: `${Math.min(100, (100 * atendimentos) / metaFundador)}%` }} />
            </div>
            <p className="text-white/60 text-xs leading-relaxed">
              {atendimentos >= metaFundador
                ? `Meta atingida. Na contagem diária o período grátis termina, e você terá 5 dias para assinar por R$ ${reais(fundador.price || FUNDADOR_PRICE)} por mês, travado por 12 meses.`
                : `Seu Premium segue grátis até completar a meta. Depois, R$ ${reais(fundador.price || FUNDADOR_PRICE)} por mês, travado por 12 meses. A contagem oficial é atualizada uma vez por dia.`}
            </p>
          </div>
        )}

        {precoFundador != null && (
          <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-400/[0.06] p-4">
            <p className="text-amber-300 text-xs font-bold uppercase tracking-wide">Vet Fundador</p>
            <p className="text-white text-sm mt-1 leading-relaxed">
              Período grátis concluído. Seu Premium mensal sai por
              <strong> R$ {reais(precoFundador)}</strong> até {travadoAte.toLocaleDateString('pt-BR')}.
            </p>
          </div>
        )}

        {/* Cards */}
        {plans === null ? (
          <div className="flex justify-center py-20"><Spinner size={30} color="#8fbc8f" /></div>
        ) : (
          /* Escada: Free → Essencial → Premium. Cada degrau é um pouco
             mais alto que o anterior (items-end alinha as bases), então
             a progressão de valor fica visível antes de ler qualquer
             preço. O Premium é o topo da escada, e não o centro. */
          <div className="grid grid-cols-3 gap-3 items-end stagger">
            {[...plans].sort((a, b) => {
              const order = { free: 0, essencial: 1, premium: 2, destaque: 2 }
              return (order[a.id] ?? 1) - (order[b.id] ?? 1)
            }).map(p => {
              const isSel = p.id === selectedId
              const isDestaque = p.id === 'premium' || p.id === 'destaque'
              const isEssencial = p.id === 'essencial'
              const isCurrent = p.id === currentPlan
              // Altura mínima crescente - é o que desenha a escada.
              const degrau = isDestaque ? 'min-h-[26rem] p-5 pt-7'
                : isEssencial ? 'min-h-[23rem] p-4 pt-6'
                : 'min-h-[20rem] p-4 pt-6'
              return (
                <button key={p.id} type="button" onClick={() => { setTocouNaSelecao(true); setSelectedId(p.id) }}
                  aria-pressed={isSel}
                  className={`plan-step relative rounded-2xl text-left flex flex-col gap-3 ${degrau} ${
                    isDestaque ? 'z-10' : ''
                  } ${
                    /* A borda diz QUAL PLANO é: verde o seu atual, dourado
                       o Premium, neutra os demais. Nunca diz seleção. */
                    isCurrent
                      ? 'bg-emerald-400/[0.08] border-2 border-emerald-400'
                      : isDestaque
                      ? 'bg-white/[0.07] border-2 border-amber-400/60 shadow-xl'
                      : 'bg-white/[0.04] border border-white/10 hover:border-white/25'
                  } ${
                    /* A seleção é um anel branco POR FORA da borda, então
                       aparece sobre qualquer um dos três fundos sem se
                       confundir com a cor do plano. */
                    isSel ? 'plan-selected' : ''
                  }`}>
                  {/* Brilho sutil que percorre o card do Premium */}
                  {isDestaque && !isCurrent && (
                    <span aria-hidden className="plan-shine pointer-events-none absolute inset-0 rounded-2xl overflow-hidden" />
                  )}

                  {/* Marca de escolhido - some junto com o anel branco.
                      Cor sozinha não basta: em tela clara, no sol, ou para
                      quem enxerga menos, o anel some e a marca fica. */}
                  {isSel && (
                    <span aria-hidden
                      className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-white
                                 flex items-center justify-center shadow-lg">
                      <svg className="w-3.5 h-3.5 text-gray-900" fill="none" stroke="currentColor"
                        strokeWidth={3.2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </span>
                  )}

                  {/* Badge topo */}
                  {isCurrent ? (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-emerald-400 text-emerald-950 text-[10px] font-bold
                                     px-2.5 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                      Plano atual
                    </span>
                  ) : isDestaque && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-400 text-gray-900 text-[10px] font-bold
                                     px-2.5 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                      Mais completo
                    </span>
                  )}

                  <div className="mt-1 relative">
                    <p className={`text-white font-bold ${isDestaque ? 'text-lg' : 'text-base'}`}>{p.name}</p>
                    <p className="mt-1">
                      <span className={`text-white font-bold tracking-tight ${isDestaque ? 'text-3xl' : 'text-2xl'}`}>
                        {brl(priceFor(p))}
                      </span>
                      {p.price > 0 && <span className="text-white/40 text-xs ml-1">{periodLabel}</span>}
                    </p>
                    {period === 'anual' && p.price > 0 && (
                      <p className="text-emerald-400 text-[10px] font-semibold mt-0.5">
                        ≈ {brl((p.price * 10) / 12)}/mês
                      </p>
                    )}
                  </div>

                  <ul className="flex flex-col gap-2 flex-1 relative">
                    {(p.benefits || []).map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-white/85 leading-snug">
                        <Check /> {b}
                      </li>
                    ))}
                    {(p.locked || []).map((b, i) => (
                      <li key={`l${i}`} className="flex items-start gap-2 text-[12px] text-white/30 leading-snug">
                        <Check locked /> {b}
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>
        )}

        {/* Cupom */}
        <div className="mt-5 rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex flex-col gap-2.5">
          <p className="text-white/80 text-xs font-bold">Tem um cupom?</p>
          <div className="flex gap-2">
            <input
              value={coupon}
              onChange={e => setCoupon(e.target.value.toUpperCase())}
              placeholder="Código do cupom"
              maxLength={20}
              className="flex-1 bg-white/[0.06] border border-white/10 rounded-xl px-4 py-2.5 text-sm
                         text-white placeholder-white/25 outline-none uppercase tracking-wider
                         focus:border-amber-400/60 transition-colors"
            />
            <button onClick={handleRedeemCoupon} disabled={couponBusy || !coupon.trim()}
              className="px-5 rounded-xl border border-white/20 text-white/80 text-sm font-bold
                         hover:bg-white/10 disabled:opacity-40 transition-all">
              {couponBusy ? <Spinner size={14} color="white" /> : 'Aplicar'}
            </button>
          </div>
          <p className="text-white/30 text-[10px]">
            Aplicado ao plano selecionado ({selected?.name || '-'}).
          </p>
        </div>
      </div>

      {/* ── Barra fixa: assinar e pagar ───────────────────────────── */}
      <div className="barra-fixa-planos fixed bottom-0 left-0 right-0 border-t border-white/10 z-40"
           style={{ background: barBg, backdropFilter: 'blur(14px)' }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-white font-bold text-sm">{selected?.name || '-'}</p>
            <p className="text-white/85">
              <span className="font-bold text-xl">{selected ? brl(priceFor(selected)) : '-'}</span>
              {selected?.price > 0 && (
                <>
                  <span className="text-white/40 text-xs ml-1">{periodLabel}</span>
                  <span className="text-white/30 text-xs ml-2">
                    · cobrado {period === 'anual' ? 'anualmente' : 'mensalmente'}
                  </span>
                </>
              )}
            </p>
          </div>
          <button onClick={handlePay} disabled={paying || !selected || mesmoPlanoTravado}
            className="bg-white text-gray-900 font-bold rounded-full px-10 py-3.5 text-sm
                       hover:bg-gray-100 active:scale-[0.98] disabled:opacity-50 transition-all">
            {paying ? <Spinner size={16} />
              : mesmoPlanoTravado ? 'Plano já ativo'
              : selected?.id === currentPlan ? 'Renovar'
              : selected?.price > 0 ? 'Assinar e pagar' : 'Ativar grátis'}
          </button>
        </div>
        <p className="max-w-3xl mx-auto px-4 pb-4 text-white/30 text-[10px] leading-relaxed">
          Pague com PIX ou cartão. O mensal vale 30 dias e o anual 365, em até 12x no cartão.
          {validade && <> Seu plano atual vale até <strong className="text-white/50">{validade.toLocaleDateString('pt-BR')}</strong>{
            mesmoPlanoTravado && <>; a renovação abre em {renovaAPartirDe.toLocaleDateString('pt-BR')}</>}.</>}
          {cupomParcial && <> Cupom <strong className="text-white/50">{cupomParcial.code}</strong>: {cupomParcial.discount}% de desconto aplicado no pagamento.</>}
        </p>
      </div>
      <VetBottomNav />
    </div>
  )
}
