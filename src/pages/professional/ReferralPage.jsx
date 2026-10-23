/**
 * ReferralPage - indicação entre veterinários.
 *
 * Cada vet tem um código único. Quando um colega indicado ativa um plano
 * (pago ou com cupom), quem indicou ganha 1 mês grátis. Plano Free não
 * conta: não é assinatura.
 *
 * - O código é reservado em referralCodes/{código} -> { uid }. A regra só
 *   deixa criar, nunca sobrescrever, então dois vets nunca dividem código.
 * - O indicado cria users/{indicador}/referrals/{seuUid} no cadastro
 *   (services/origem.js) e marca activatedPlan quando assina.
 * - Os meses são CONTADOS a partir dessas entradas, não guardados num
 *   contador: quem indica não pode escrever no documento de quem foi
 *   indicado, e vice-versa, sem Cloud Function (plano Spark).
 */

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, collection, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { VetBottomNav } from '../../components/common/BottomNav'
import { showToast } from '../../components/common/Toast'
import Spinner from '../../components/common/Spinner'

function gerarCodigo(nome) {
  // Sem "DR"/"DRA" na frente: com eles, metade dos códigos começava igual.
  const limpo = (nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^(dra?|dr)\.?\s+/i, '')
    .replace(/[^A-Za-z]/g, '').toUpperCase()
  const prefixo = (limpo || 'VET').slice(0, 4).padEnd(4, 'X')
  return `${prefixo}${Math.floor(1000 + Math.random() * 9000)}`
}

/**
 * Garante que o código do usuário existe em referralCodes e é dele.
 * Conta antiga (código só em users.referralCode) é migrada aqui; se o
 * código antigo tiver dono diferente, gera outro.
 */
async function reservarCodigo(uid, nome, atual) {
  const tentativas = atual ? [atual] : []
  for (let i = 0; i < 6; i++) tentativas.push(gerarCodigo(nome))

  for (const codigo of tentativas) {
    const ref = doc(db, 'referralCodes', codigo)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      if (snap.data().uid === uid) return codigo
      continue                         // já é de outra pessoa
    }
    try {
      await setDoc(ref, { uid, createdAt: serverTimestamp() })
      if (codigo !== atual) {
        await setDoc(doc(db, 'users', uid), { referralCode: codigo }, { merge: true })
      }
      return codigo
    } catch {
      // Outra pessoa reservou entre o get e o set. Tenta o próximo.
    }
  }
  throw new Error('não foi possível reservar um código')
}

const nomePlano = p => p ? p.charAt(0).toUpperCase() + p.slice(1) : ''

/**
 * O que cada indicação rendeu. Ativação com cupom também conta
 * (decisão do negócio: enquanto não há pagamento, o cupom é o único
 * jeito de assinar). Fica escrito "com cupom" para o admin distinguir.
 */
function situacao(r) {
  if (!r.activatedPlan || r.activatedPlan === 'free') {
    return { texto: 'Cadastrou, ainda sem plano', selo: 'Aguardando', tom: 'cinza', credita: false }
  }
  const como = r.viaCupom ? ' com cupom' : ''
  return { texto: `Ativou o ${nomePlano(r.activatedPlan)}${como}`, selo: '+1 mês', tom: 'verde', credita: true }
}

export default function ReferralPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid

  const [code, setCode] = useState('')
  const [erroCodigo, setErroCodigo] = useState(false)
  const [referrals, setReferrals] = useState(null)
  const [copied, setCopied] = useState(false)

  // Código: reservado uma vez por visita.
  useEffect(() => {
    if (!uid) return
    let vivo = true
    ;(async () => {
      try {
        const eu = (await getDoc(doc(db, 'users', uid))).data() || {}
        const c = await reservarCodigo(uid, eu.name || eu.firstName || user?.displayName, eu.referralCode)
        if (vivo) setCode(c)
      } catch (e) {
        // Mostrar um código que não está reservado mandaria o colega
        // para um cadastro que não credita ninguém.
        console.error('[indicação] código:', e)
        if (vivo) setErroCodigo(true)
      }
    })()
    return () => { vivo = false }
  }, [uid, user?.displayName])

  // Indicações ao vivo: o colega assina e o mês aparece sem recarregar.
  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'referrals'), async snap => {
      const lista = await Promise.all(snap.docs.map(async r => {
        const vet = await getDoc(doc(db, 'users', r.id)).catch(() => null)
        return { id: r.id, ...r.data(), vetName: vet?.data()?.name || 'Colega' }
      }))
      lista.sort((a, b) => (b.referredAt?.seconds || 0) - (a.referredAt?.seconds || 0))
      setReferrals(lista)
    }, e => {
      console.error('[indicação] lista:', e)
      setReferrals([])
    })
  }, [uid])

  const meses = (referrals || []).filter(r => situacao(r).credita).length
  const shareLink = code ? `${window.location.origin}/conheca?ref=${code}` : ''

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('Não deu para copiar. Segure o link para copiar manualmente.', 'error')
    }
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(
      `Estou usando o AVANTE para receber atendimentos veterinários a domicílio na minha região. ` +
      `Os pedidos chegam pelo app e você aceita só o que quiser. Cadastre-se pelo meu link: ${shareLink}`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener')
  }

  if (!code && !erroCodigo) return (
    <div className="flex items-center justify-center min-h-screen"><Spinner size={32} color="#375337" /></div>
  )

  return (
    <div className="page-container largura-lista pb-nav">
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary" aria-label="Voltar">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="page-title">Indicações</h1>
        <div className="w-6" />
      </div>

      {/* Computador: o link e o "como funciona" lado a lado; a lista de
          colegas embaixo, na largura toda. */}
      <div className="px-4 py-4 flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">

        {meses > 0 && (
          <div className="card bg-primary/5 border border-primary/20 flex items-center gap-3 lg:col-span-2">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-primary text-sm">
                {meses} {meses === 1 ? 'mês grátis conquistado' : 'meses grátis conquistados'}
              </p>
              <p className="text-xs text-gray-500">Descontados das suas próximas mensalidades</p>
            </div>
          </div>
        )}

        <div className="card">
          <p className="card-title mb-4">Seu link de indicação</p>

          {erroCodigo ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Não conseguimos gerar seu código agora. Verifique a conexão e abra esta tela de novo.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-center">
                  <p className="text-3xl font-bold text-primary tracking-[0.2em]">{code}</p>
                </div>
                <button onClick={copyLink}
                  className={`flex-shrink-0 px-4 min-h-[48px] rounded-2xl font-semibold text-sm transition-all ${
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-primary text-white hover:bg-primary-600 active:scale-95'
                  }`}>
                  {copied ? 'Copiado' : 'Copiar link'}
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-500 text-center">
                  Cada colega que ativar um plano pelo seu link vale 1 mês grátis para você
                </p>
                <button onClick={shareWhatsApp}
                  className="w-full py-3 rounded-2xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-green-600 transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.554 4.122 1.522 5.858L0 24l6.337-1.502A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.79 9.79 0 01-5.032-1.388l-.361-.214-3.762.891.936-3.653-.236-.374A9.773 9.773 0 012.182 12C2.182 6.581 6.581 2.182 12 2.182S21.818 6.581 21.818 12 17.419 21.818 12 21.818z"/>
                  </svg>
                  Compartilhar no WhatsApp
                </button>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <p className="card-title mb-3">Como funciona</p>
          <div className="flex flex-col gap-3">
            {[
              'Mande seu link para colegas veterinários',
              'Eles conhecem o AVANTE e se cadastram pelo link',
              'Quando um deles ativa um plano, você ganha 1 mês grátis',
              'Não tem limite: cada colega que ativar vale mais um mês',
            ].map((texto, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                  {i + 1}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed flex-1">{texto}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          <p className="section-title">Colegas indicados ({referrals?.length ?? 0})</p>
          {referrals === null ? (
            <div className="card flex justify-center py-8"><Spinner size={22} color="#375337" /></div>
          ) : referrals.length === 0 ? (
            <div className="card text-center py-10 text-gray-400 text-sm">
              Ninguém se cadastrou pelo seu link ainda.
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {referrals.map(r => {
                const s = situacao(r)
                return (
                  <div key={r.id} className="card flex items-center gap-3 py-3">
                    <div className="avatar-circle w-10 h-10 text-sm flex-shrink-0">
                      {r.vetName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800 truncate">{r.vetName}</p>
                      <p className="text-xs text-gray-400">{s.texto}</p>
                    </div>
                    <span className={`flex-shrink-0 text-xs font-bold px-2 py-1 rounded-full ${
                      s.tom === 'verde' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {s.selo}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
      <VetBottomNav />
    </div>
  )
}
