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
export default function OffersBanner({ className = '' }) {
  const [offers, setOffers] = useState([])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    getDocs(query(collection(db, 'offers'), where('active', '==', true), limit(5)))
      .then(snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
        setOffers(list)
      })
      .catch(() => setOffers([]))
  }, [])

  // Rotaciona entre ofertas a cada 6s
  useEffect(() => {
    if (offers.length <= 1) return
    const t = setInterval(() => setIndex(i => (i + 1) % offers.length), 6000)
    return () => clearInterval(t)
  }, [offers.length])

  if (offers.length === 0) return null
  const offer = offers[index]

  return (
    <a
      // Segurança: só URLs https (bloqueia javascript: e afins) e
      // noopener/noreferrer contra tab-nabbing
      href={(offer.url || '').startsWith('https://') ? offer.url : '#'}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 shadow-sm anim-fade-in
                  bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60
                  hover:shadow-card transition-shadow ${className}`}
    >
      <span className="text-2xl flex-shrink-0">{offer.emoji || '🐾'}</span>
      <div className="flex-1 min-w-0">
        <span className="text-[9px] font-bold text-amber-600/70 uppercase tracking-widest">
          Oferta parceira
        </span>
        <p className="font-bold text-gray-800 text-sm leading-tight truncate">{offer.title}</p>
        {offer.subtitle && <p className="text-gray-500 text-xs truncate">{offer.subtitle}</p>}
      </div>
      <span className="bg-amber-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-full flex-shrink-0">
        {offer.cta || 'Ver'}
      </span>
    </a>
  )
}
