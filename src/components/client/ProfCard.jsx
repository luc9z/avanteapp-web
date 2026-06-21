/**
 * ProfCard — cartão de veterinário em formato de grade (2 colunas).
 * - Selo "Destaque" para profissionais com plano destacado (monetização)
 * - Coração de favoritar (salvo no perfil do cliente)
 * - Botão de mensagem: conversa direta ANTES de enviar solicitação
 * - Avaliação real (média + contagem) ou selo "Novo"
 */
import Stars from '../common/Stars'

export function isOnlineCheck(d) {
  for (const k of ['is_online', 'isOnline', 'online', 'available', 'status', 'is_on']) {
    const v = d[k]
    if (v == null) continue
    if (v === true || v === 1) return true
    if (typeof v === 'string') {
      const s = v.toLowerCase()
      if (['true', '1', 'online', 'available', 'sim', 'yes'].includes(s)) return true
    }
  }
  return false
}

export function isFeatured(prof) {
  return prof.featured === true || prof.plan === 'destaque' || prof.plan === 'pro'
}

export default function ProfCard({ prof, isFavorite, onToggleFavorite, onView, onRequest, onMessage }) {
  const online = isOnlineCheck(prof)
  const featured = isFeatured(prof)
  const ratingCount = Number(prof.ratingCount || 0)
  const rating = ratingCount > 0 ? Number(prof.averageRating || 0) : null
  const specialties = Array.isArray(prof.specialties)
    ? prof.specialties.slice(0, 2).join(' · ')
    : (prof.specialty || '')

  return (
    <div
      onClick={onView}
      className={`relative flex flex-col rounded-2xl bg-white p-3.5 cursor-pointer transition-all
                  active:scale-[0.98] hover:shadow-card-hover ${
        featured
          ? 'border-2 border-amber-300 shadow-[0_2px_14px_rgba(245,158,11,0.18)]'
          : 'border border-gray-100 shadow-card'
      }`}
    >
      {/* Selo destaque */}
      {featured && (
        <span className="absolute -top-2.5 left-3 flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-500
                         text-white text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shadow-sm">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Destaque
        </span>
      )}

      {/* Coração favoritar */}
      <button
        onClick={e => { e.stopPropagation(); onToggleFavorite?.() }}
        aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        className="absolute top-2.5 right-2.5 p-1.5 rounded-full hover:bg-red-50 transition-colors z-10"
      >
        <svg className={`w-[18px] h-[18px] transition-all ${isFavorite ? 'text-red-500 scale-110' : 'text-gray-300 hover:text-red-300'}`}
          fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </button>

      {/* Avatar + status */}
      <div className="relative w-14 h-14 mx-auto mt-2">
        <div className={`avatar-circle w-14 h-14 text-xl ${featured ? 'bg-amber-50 text-amber-600' : ''}`}>
          {(prof.name || '?')[0]}
        </div>
        <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${
          online ? 'bg-green-500' : 'bg-gray-300'
        }`} />
      </div>

      {/* Nome + dados */}
      <div className="text-center mt-2 mb-1.5 min-w-0">
        <p className="font-bold text-gray-900 text-sm leading-tight truncate px-1">{prof.name}</p>
        {prof.council && <p className="text-gray-400 text-[10px] mt-0.5">CRMV {prof.council}</p>}
        {specialties && <p className="text-gray-400 text-[11px] truncate px-1">{specialties}</p>}
        <div className="flex items-center justify-center gap-1 mt-1.5 min-h-[18px]">
          {rating !== null ? (
            <>
              <Stars rating={rating} size={11} />
              <span className="text-gray-500 text-[11px] font-semibold">
                {rating.toFixed(1)} <span className="font-normal text-gray-300">({ratingCount})</span>
              </span>
            </>
          ) : (
            <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              Novo no Avante
            </span>
          )}
        </div>
      </div>

      {/* Ações */}
      <div className="flex gap-1.5 mt-auto pt-1" onClick={e => e.stopPropagation()}>
        <button
          onClick={onRequest}
          className={`flex-1 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95 ${
            online
              ? 'bg-primary text-white hover:bg-primary-600'
              : 'border-2 border-primary/40 text-primary hover:bg-primary/5'
          }`}
        >
          {online ? 'Solicitar' : 'Agendar'}
        </button>
        <button
          onClick={onMessage}
          aria-label="Enviar mensagem"
          title="Conversar antes de solicitar"
          className="w-10 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-primary
                     hover:border-primary/40 hover:bg-primary/5 active:scale-95 transition-all
                     flex items-center justify-center"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
