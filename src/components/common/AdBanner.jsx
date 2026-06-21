const ADS = {
  topBanner: {
    bg: 'bg-gradient-to-r from-amber-400 to-orange-400',
    title: 'Ração Premium PetNutri',
    sub: 'Nutrição completa para seu pet · Entrega grátis',
    cta: 'Ver oferta',
    emoji: '🐾',
  },
  midList: {
    bg: 'bg-gradient-to-r from-blue-500 to-primary',
    title: 'PetShop AvanteStore',
    sub: '10% off na primeira compra com código AVANTE10',
    cta: 'Aproveitar',
    emoji: '🛍️',
  },
  listItem: {
    bg: 'bg-gradient-to-r from-purple-500 to-pink-500',
    title: 'Seguro Pet VidaAnimal',
    sub: 'Proteja seu pet com planos a partir de R$29/mês',
    cta: 'Saiba mais',
    emoji: '🏥',
  },
}

export default function AdBanner({ slot = 'topBanner', className = '' }) {
  const ad = ADS[slot] || ADS.topBanner
  return (
    <div className={`rounded-2xl ${ad.bg} px-4 py-3 flex items-center gap-3 shadow-sm ${className}`}>
      <span className="text-2xl flex-shrink-0">{ad.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[9px] font-bold text-white/80 uppercase tracking-widest
                           bg-black/20 px-1.5 py-0.5 rounded">
            Patrocinado · Teste
          </span>
        </div>
        <p className="font-bold text-white text-sm leading-tight truncate">{ad.title}</p>
        <p className="text-white/80 text-xs truncate">{ad.sub}</p>
      </div>
      <button className="bg-white text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full
                         flex-shrink-0 hover:bg-gray-100 active:scale-95 transition-all whitespace-nowrap">
        {ad.cta}
      </button>
    </div>
  )
}
