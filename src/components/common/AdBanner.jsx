/**
 * AdBanner — banner de anúncio grande, lido do Firestore.
 *
 * Coleção `offers` — campos:
 *   active: true
 *   size: 'large'          ← filtra banners grandes (small = OffersBanner)
 *   title, subtitle, cta, url, emoji
 *   gradient: 'amber' | 'blue' | 'green' | 'purple' | 'red'  (opcional)
 *   order: number
 *
 * Rotate automático a cada 8s quando há mais de um ativo.
 * Não renderiza nada se não houver offer com size='large' e active=true.
 */
import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../../firebase'

const GRADIENTS = {
  amber:  'from-amber-400 to-orange-500',
  blue:   'from-blue-500 to-indigo-600',
  green:  'from-emerald-500 to-teal-600',
  purple: 'from-violet-500 to-purple-700',
  red:    'from-rose-500 to-pink-600',
  teal:   'from-teal-400 to-cyan-600',
}

export default function AdBanner({ className = '', fallback = null, audience = 'all' }) {
  const [offers, setOffers] = useState([])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    getDocs(query(
      collection(db, 'offers'),
      where('active', '==', true),
      where('size', '==', 'large'),
      limit(12)
    ))
      .then(snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          // Filtra por público-alvo: oferta sem audience (ou 'all') aparece
          // para todos; com audience específico só aparece pra esse público.
          .filter(o => {
            const aud = o.audience || 'all'
            return aud === 'all' || aud === audience
          })
          .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
        setOffers(list)
      })
      .catch(() => {})
  }, [audience])

  useEffect(() => {
    if (offers.length <= 1) return
    const t = setInterval(() => setIndex(i => (i + 1) % offers.length), 8000)
    return () => clearInterval(t)
  }, [offers.length])

  if (offers.length === 0) return fallback ? <div className={className}>{fallback}</div> : null
  const offer = offers[index]
  const grad = GRADIENTS[offer.gradient] || GRADIENTS.amber
  const safeUrl = (offer.url || '').startsWith('https://') ? offer.url : '#'

  return (
    <a
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={`block rounded-3xl overflow-hidden shadow-lg active:scale-[0.98] transition-all ${className}`}
    >
      <div className={`bg-gradient-to-br ${grad} px-5 py-5 flex items-center gap-4 relative min-h-[110px]`}>
        {/* Decorative circles */}
        <div className="absolute right-4 top-2 w-24 h-24 bg-white/10 rounded-full -translate-y-2 translate-x-4" />
        <div className="absolute right-12 bottom-0 w-16 h-16 bg-white/10 rounded-full translate-y-4" />

        {/* Emoji / icon */}
        <div className="flex-shrink-0 w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center z-10">
          <span className="text-3xl">{offer.emoji || '🐾'}</span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 z-10">
          <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest">
            Parceiro Avante
          </span>
          <p className="font-black text-white text-base leading-tight mt-0.5">{offer.title}</p>
          {offer.subtitle && (
            <p className="text-white/85 text-xs mt-1 leading-snug">{offer.subtitle}</p>
          )}
        </div>

        {/* CTA */}
        <div className="flex-shrink-0 z-10">
          <span className="bg-white text-gray-800 text-xs font-black px-4 py-2 rounded-full
                           shadow-md block text-center whitespace-nowrap">
            {offer.cta || 'Ver'}
          </span>
        </div>
      </div>

      {/* Dot indicators */}
      {offers.length > 1 && (
        <div className={`flex justify-center gap-1.5 py-2 bg-gradient-to-br ${grad} bg-opacity-20`}>
          {offers.map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${
              i === index ? 'bg-white scale-125' : 'bg-white/40'
            }`} />
          ))}
        </div>
      )}
    </a>
  )
}
