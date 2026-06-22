import { useEffect, useState } from 'react'
import { collection, query, where, limit, getDocs } from 'firebase/firestore'
import { db } from '../../firebase'

/**
 * OffersBanner — espaço de monetização com ofertas REAIS.
 *
 * Lê a coleção `offers` do Firestore (gerenciada por você no console
 * ou num futuro painel admin). Se não houver ofertas ativas, não
 * renderiza nada — diferente do antigo AdBanner, que exibia anúncios
 * fictícios hardcoded.
 *
 * Documento esperado em offers/{id}:
 *   { active: true, title, subtitle, cta, url, emoji?, order? }
 */
const GRADIENTS = {
  amber:  'from-amber-400 to-orange-500',
  blue:   'from-blue-500 to-indigo-600',
  green:  'from-emerald-500 to-teal-600',
  purple: 'from-violet-500 to-purple-700',
  red:    'from-rose-500 to-pink-600',
  teal:   'from-teal-400 to-cyan-600',
}

export default function OffersBanner({ className = '', audience = 'all' }) {
  const [offers, setOffers] = useState([])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    getDocs(query(collection(db, 'offers'), where('active', '==', true), limit(12)))
      .then(snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          // só ofertas pequenas (size 'large' fica no AdBanner) e do público certo
          .filter(o => (o.size || 'small') !== 'large')
          .filter(o => {
            const aud = o.audience || 'all'
            return aud === 'all' || aud === audience
          })
          .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
        setOffers(list)
      })
      .catch(() => setOffers([]))
  }, [audience])

  // Rotaciona entre ofertas a cada 6s
  useEffect(() => {
    if (offers.length <= 1) return
    const t = setInterval(() => setIndex(i => (i + 1) % offers.length), 6000)
    return () => clearInterval(t)
  }, [offers.length])

  if (offers.length === 0) return null
  const offer = offers[index]
  const grad = GRADIENTS[offer.gradient] || GRADIENTS.amber

  return (
    <a
      // Segurança: só URLs https (bloqueia javascript: e afins) e
      // noopener/noreferrer contra tab-nabbing
      href={(offer.url || '').startsWith('https://') ? offer.url : '#'}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 shadow-md anim-fade-in
                  bg-gradient-to-r ${grad} active:scale-[0.99] hover:shadow-lg transition-all ${className}`}
    >
      <span className="text-2xl flex-shrink-0 drop-shadow">{offer.emoji || '🐾'}</span>
      <div className="flex-1 min-w-0">
        <span className="text-[9px] font-bold text-white/80 uppercase tracking-widest">
          Oferta parceira
        </span>
        <p className="font-bold text-white text-sm leading-tight truncate drop-shadow-sm">{offer.title}</p>
        {offer.subtitle && <p className="text-white/85 text-xs truncate">{offer.subtitle}</p>}
      </div>
      <span className="bg-white text-gray-800 text-xs font-extrabold px-3.5 py-1.5 rounded-full flex-shrink-0 shadow-sm">
        {offer.cta || 'Ver'}
      </span>
    </a>
  )
}
