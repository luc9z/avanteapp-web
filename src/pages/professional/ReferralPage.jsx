/**
 * ReferralPage - sistema de indicação para veterinários.
 * Cada vet tem um código único. Ao indicar outro vet que ativa um plano,
 * o indicador ganha 1 mês grátis no seu plano atual.
 *
 * Lógica client-side:
 * - Código gerado: primeiras 4 letras do nome + 4 dígitos aleatórios (ex: ANA8421)
 * - Armazenado em users/{uid}.referralCode
 * - Novos vets que usam o código: registrados em users/{uid}/referrals/{newVetId}
 * - Créditos: users/{uid}.referralCredits (meses grátis acumulados)
 */

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { VetBottomNav } from '../../components/common/BottomNav'
import { showToast } from '../../components/common/Toast'
import Spinner from '../../components/common/Spinner'

function generateCode(name) {
  const prefix = (name || 'VET').replace(/\s+/g, '').toUpperCase().slice(0, 4).padEnd(4, 'X')
  const suffix = Math.floor(1000 + Math.random() * 9000)
  return `${prefix}${suffix}`
}

export default function ReferralPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid

  const [code, setCode] = useState('')
  const [credits, setCredits] = useState(0)
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!uid) return
    return onSnapshot(doc(db, 'users', uid), async snap => {
      const d = snap.data() || {}

      if (!d.referralCode) {
        // Gera o código e SÓ mostra depois de gravar. Se a gravação
        // falhasse em silêncio, o link levaria um código que não existe
        // em nenhum usuário - e a indicação nunca seria registrada.
        const newCode = generateCode(d.name || d.firstName || '')
        try {
          await setDoc(doc(db, 'users', uid), { referralCode: newCode }, { merge: true })
          setCode(newCode)
        } catch (e) {
          console.error('[referral] não foi possível salvar o código:', e)
          showToast('Não foi possível gerar seu código. Tente novamente.', 'error')
        }
      } else {
        setCode(d.referralCode)
      }

      setCredits(d.referralCredits || 0)

      // Busca indicações realizadas. Nunca deixa a página presa no loading:
      // se a leitura falhar (permissão/rede), mostra a página mesmo assim.
      try {
        const refSnap = await getDocs(collection(db, 'users', uid, 'referrals'))
        const refs = await Promise.all(refSnap.docs.map(async r => {
          const vetSnap = await getDoc(doc(db, 'users', r.id)).catch(() => null)
          return { id: r.id, ...r.data(), vetName: vetSnap?.data()?.name || 'Veterinário' }
        }))
        setReferrals(refs)
      } catch (e) {
        console.error('[referral] falha ao carregar indicações:', e)
        setReferrals([])
      } finally {
        setLoading(false)
      }
    }, err => {
      console.error('[referral] listener falhou:', err)
      setLoading(false)
    })
  }, [uid])

  const shareLink = `${window.location.origin}/register?ref=${code}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('Copie o link manualmente', 'error')
    }
  }

  async function shareWhatsApp() {
    const text = encodeURIComponent(
      `Olá! Estou usando o AVANTE para gerenciar meus atendimentos veterinários a domicílio. Use meu código *${code}* para se cadastrar e ganhe vantagens: ${shareLink}`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen"><Spinner size={32} color="#375337" /></div>
  )

  return (
    <div className="page-container largura-leitura pb-nav">
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="page-title">Indicações</h1>
        <div className="w-6" />
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">

        {/* Créditos */}
        {credits > 0 && (
          <div className="card bg-primary/5 border border-primary/20 flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-primary text-sm">{credits} {credits === 1 ? 'mês grátis' : 'meses grátis'} disponível{credits === 1 ? '' : 'is'}</p>
              <p className="text-xs text-gray-500">Será aplicado na próxima renovação do seu plano</p>
            </div>
          </div>
        )}

        {/* Código de indicação */}
        <div className="card">
          <p className="card-title mb-4">Seu código de indicação</p>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-center">
              <p className="text-3xl font-bold text-primary tracking-[0.2em]">{code}</p>
            </div>
            <button onClick={copyLink}
              className={`flex-shrink-0 px-4 py-3 rounded-2xl font-semibold text-sm transition-all ${
                copied
                  ? 'bg-green-500 text-white'
                  : 'bg-primary text-white hover:bg-primary-600 active:scale-95'
              }`}>
              {copied ? 'Copiado' : 'Copiar link'}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-500 text-center">Compartilhe e ganhe 1 mês grátis por cada colega que ativar um plano</p>
            <button onClick={shareWhatsApp}
              className="w-full py-3 rounded-2xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-green-600 transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.554 4.122 1.522 5.858L0 24l6.337-1.502A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.79 9.79 0 01-5.032-1.388l-.361-.214-3.762.891.936-3.653-.236-.374A9.773 9.773 0 012.182 12C2.182 6.581 6.581 2.182 12 2.182S21.818 6.581 21.818 12 17.419 21.818 12 21.818z"/>
              </svg>
              Compartilhar no WhatsApp
            </button>
          </div>
        </div>

        {/* Regras */}
        <div className="card">
          <p className="card-title mb-3">Como funciona</p>
          <div className="flex flex-col gap-3">
            {[
              { icon: '1', text: 'Compartilhe seu código com outros veterinários' },
              { icon: '2', text: 'Quando seu colega se cadastrar e ativar qualquer plano pago, você ganha 1 mês grátis' },
              { icon: '3', text: 'Os créditos são aplicados automaticamente na próxima renovação' },
              { icon: '★', text: 'Não há limite de indicações: quanto mais você indica, mais meses ganha!' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                  {item.icon}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed flex-1">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Lista de indicações */}
        <div>
          <p className="section-title">Veterinários indicados ({referrals.length})</p>
          {referrals.length === 0 ? (
            <div className="card text-center py-10 text-gray-400 text-sm">
              Ainda não há indicações. Compartilhe seu código!
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {referrals.map(r => (
                <div key={r.id} className="card flex items-center gap-3 py-3">
                  <div className="avatar-circle w-10 h-10 text-sm flex-shrink-0">
                    {r.vetName[0]}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-gray-800">{r.vetName}</p>
                    <p className="text-xs text-gray-400">
                      {r.activatedPlan ? `Plano ${r.activatedPlan} ativo · +1 mês creditado` : 'Cadastrado, aguardando ativação de plano'}
                    </p>
                  </div>
                  {r.activatedPlan ? (
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">+1 mês</span>
                  ) : (
                    <span className="bg-gray-100 text-gray-400 text-xs font-semibold px-2 py-1 rounded-full">Pendente</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      <VetBottomNav />
    </div>
  )
}
