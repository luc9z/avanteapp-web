const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'

function Star({ size, fill }) {
  // fill: 0..1 — fração preenchida em âmbar
  const pct = Math.max(0, Math.min(1, fill)) * 100
  return (
    <span className="relative inline-block flex-shrink-0" style={{ width: size, height: size }}>
      {/* base cinza */}
      <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0">
        <path d={STAR_PATH} fill="#d1d5db" />
      </svg>
      {/* preenchimento âmbar recortado pela fração */}
      {pct > 0 && (
        <span className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
          <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
            <path d={STAR_PATH} fill="#f59e0b" />
          </svg>
        </span>
      )}
    </span>
  )
}

export default function Stars({ rating = 0, size = 16 }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map(i => (
        <Star key={i} size={size} fill={rating - i} />
      ))}
    </span>
  )
}
