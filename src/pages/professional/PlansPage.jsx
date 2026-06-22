/**
 * PlansPage — planos do veterinário, estilo "premium" (referência: X/Twitter).
 * Cards escuros lado a lado, toggle Mensal/Anual (anual = 2 meses grátis),
 * selo "Melhor valor", cupom e barra fixa de pagamento via AbacatePay.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { showToast } from '../../components/common/Toast'
import { DEFAULT_PLANS } from '../admin/AdminPage'
import { VetBottomNav } from '../../components/common/BottomNav'
import { useTheme } from '../../contexts/ThemeContext'

const createCheckout = httpsCallable(functions, 'createPlanCheckout')
const redeemCoupon = httpsCallable(functions, 'redeemCoupon')

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
  const [period, setPeriod] = useState('mensal') // mensal | anual
  const [coupon, setCoupon] = useState('')
  const [couponBusy, setCouponBusy] = useState(false)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    return onSnapshot(doc(db, 'config', 'plans'),
      snap => setPlans(snap.exists() && Array.isArray(snap.data().plans) ? snap.data().plans : DEFAULT_PLANS),
      () => setPlans(DEFAULT_PLANS)
    )
  }, [])

  useEffect(() => {
    if (!user?.uid) return
    return onSnapshot(doc(db, 'users', user.uid), snap => {
      setCurrentPlan(snap.data()?.plan || null)
    }, () => {})
  }, [user?.uid])

  useEffect(() => {
    if (searchParams.get('status') === 'paid') {
      showToast('Pagamento em processamento! Seu plano ativa em instantes.', 'success')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = useMemo(
    () => (plans || []).find(p => p.id === selectedId) || null,
    [plans, selectedId]
  )

  // Anual = 12 meses pelo preço de 10 (2 meses grátis)
  const priceFor = p => period === 'anual' ? p.price * 10 : p.price
  const periodLabel = period === 'anual' ? '/ano' : '/mês'

  async function handleRedeemCoupon() {
    const code = coupon.trim().toUpperCase()
    if (!code) return showToast('Digite o código do cupom', 'error')
    if (!selectedId) return showToast('Selecione um plano primeiro.', 'error')
    setCouponBusy(true)
    try {
      // Cupons de lançamento: validados no cliente, ativam instantâneo sem Cloud Function
      const LAUNCH_COUPONS = { BEMVINDO: 100, AVANTE100: 100 }
      if (LAUNCH_COUPONS[code] === 100) {
        if (selectedId === currentPlan) {
          showToast('Este já é seu plano atual.', 'error')
          return
        }
        await setDoc(doc(db, 'users', user.uid), {
          plan: selectedId,
          featured: ['premium', 'destaque'].includes(selectedId),
          planActivatedAt: serverTimestamp(),
          planCoupon: code,
          updatedAt: serverTimestamp(),
        }, { merge: true })
        showToast(`Cupom ${code} aplicado — plano ativado! 🎉`, 'success')
        setTimeout(() => navigate('/dashboard', { replace: true }), 900)
        return
      }

      // Cupons dinâmicos via Cloud Function (requer Blaze plan)
      const { data } = await redeemCoupon({ planId: selectedId, code })
      if (data?.activated) {
        showToast(`Cupom ${code} aplicado — plano ativado com 100% de desconto! 🎉`, 'success')
        setTimeout(() => navigate('/dashboard', { replace: true }), 900)
      } else if (data?.discount > 0) {
        showToast(`Cupom válido: ${data.discount}% de desconto no pagamento.`, 'success')
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error(e)
      showToast(
        e?.code === 'functions/not-found' ? 'Cupom inválido ou expirado.'
          : 'Cupom inválido ou expirado.',
        'error'
      )
    } finally { setCouponBusy(false) }
  }

  async function handlePay() {
    if (!selected || selected.id === currentPlan) return
    setPaying(true)
    try {
      if (selected.price <= 0) {
        await setDoc(doc(db, 'users', user.uid), {
          plan: selected.id,
          planActivatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
        showToast(`Plano ${selected.name} ativado!`, 'success')
        setTimeout(() => navigate('/dashboard', { replace: true }), 800)
        return
      }

      // Pagamento via PIX em breve — use cupom para ativar agora
      showToast('Pagamento via PIX em breve! Use o cupom BEMVINDO para ativar agora.', 'info')
    } catch (e) {
      if (import.meta.env.DEV) console.error(e)
      showToast('Não foi possível iniciar o pagamento.', 'error')
    } finally { setPaying(false) }
  }

  return (
    <div className="min-h-screen min-h-dvh" style={{ background: pageBg }}>
      <div className="max-w-3xl mx-auto px-4 pb-44">

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
          <img src="/images/avante_mark_white.png" alt="" className="w-14 h-14 opacity-95" />
          <h1 className="text-white font-bold text-2xl sm:text-3xl">
            {onboarding ? 'Escolha seu plano para começar' : 'Evolua seu perfil no Avante'}
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

        {/* Cards */}
        {plans === null ? (
          <div className="flex justify-center py-20"><Spinner size={30} color="#8fbc8f" /></div>
        ) : (
          <div className="grid grid-cols-3 gap-3 items-center stagger">
            {[...plans].sort((a, b) => {
              // Premium no centro
              const order = { free: 0, essencial: 2, premium: 1, destaque: 1 }
              return (order[a.id] ?? 1) - (order[b.id] ?? 1)
            }).map(p => {
              const isSel = p.id === selectedId
              const isDestaque = p.id === 'premium' || p.id === 'destaque'
              const isCurrent = p.id === currentPlan
              return (
                <button key={p.id} type="button" onClick={() => setSelectedId(p.id)}
                  className={`relative rounded-2xl p-4 text-left transition-all flex flex-col gap-3 ${
                    isDestaque ? 'sm:scale-110 z-10 py-6 shadow-2xl' : ''
                  } ${
                    isCurrent
                      ? 'bg-emerald-400/[0.08] border-2 border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.18)]'
                      : isSel
                      ? 'bg-white/[0.06] border-2 border-amber-400 shadow-[0_0_28px_rgba(245,180,40,0.22)]'
                      : isDestaque
                      ? 'bg-white/[0.07] border-2 border-amber-400/60'
                      : 'bg-white/[0.04] border border-white/10 hover:border-white/25'
                  }`}>
                  {/* Badge topo */}
                  {isCurrent ? (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-emerald-400 text-emerald-950 text-[10px] font-bold
                                     px-2.5 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                      ✓ Plano atual
                    </span>
                  ) : isDestaque && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-400 text-gray-900 text-[10px] font-bold
                                     px-2.5 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                      Melhor valor
                    </span>
                  )}

                  <div className="mt-1">
                    <p className="text-white font-bold text-base">{p.name}</p>
                    <p className="mt-1">
                      <span className="text-white font-bold text-2xl tracking-tight">{brl(priceFor(p))}</span>
                      {p.price > 0 && <span className="text-white/40 text-xs ml-1">{periodLabel}</span>}
                    </p>
                    {period === 'anual' && p.price > 0 && (
                      <p className="text-emerald-400 text-[10px] font-semibold mt-0.5">
                        ≈ {brl((p.price * 10) / 12)}/mês
                      </p>
                    )}
                  </div>

                  <ul className="flex flex-col gap-2 flex-1">
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
              placeholder="Ex.: BEMVINDO"
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
            Aplicado ao plano selecionado ({selected?.name || '—'}).
          </p>
        </div>
      </div>

      {/* ── Barra fixa: assinar e pagar ───────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 z-40"
           style={{ background: barBg, backdropFilter: 'blur(14px)' }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-white font-bold text-sm">{selected?.name || '—'}</p>
            <p className="text-white/85">
              <span className="font-bold text-xl">{selected ? brl(priceFor(selected)) : '—'}</span>
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
          <button onClick={handlePay} disabled={paying || !selected || selected.id === currentPlan}
            className="bg-white text-gray-900 font-bold rounded-full px-10 py-3.5 text-sm
                       hover:bg-gray-100 active:scale-[0.98] disabled:opacity-50 transition-all">
            {paying ? <Spinner size={16} />
              : selected?.id === currentPlan ? '✓ Plano já ativo'
              : selected?.price > 0 ? 'Assinar e pagar' : 'Ativar grátis'}
          </button>
        </div>
        <p className="max-w-3xl mx-auto px-4 pb-4 text-white/30 text-[10px] leading-relaxed">
          Use o cupom <strong className="text-white/40">BEMVINDO</strong> para ativar qualquer plano gratuitamente.
          Pagamento via PIX disponível em breve.
        </p>
      </div>
      <VetBottomNav />
    </div>
  )
}
