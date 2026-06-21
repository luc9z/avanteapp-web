/**
 * Charts — gráficos leves em SVG puro (sem dependências externas).
 * Usados na página de Relatórios do veterinário, alimentados em
 * tempo real por onSnapshot.
 */

/* ── Donut / pizza ────────────────────────────────────────────── */
export function DonutChart({ data, size = 168, thickness = 26, centerLabel, centerSub }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <div className="flex items-center gap-5">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={thickness} />
          {total > 0 && data.map((d, i) => {
            const frac = d.value / total
            const dash = frac * c
            const el = (
              <circle
                key={i}
                cx={size / 2} cy={size / 2} r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap={data.length > 1 ? 'butt' : 'round'}
                style={{ transition: 'stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease' }}
              />
            )
            offset += dash
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900 leading-none">{centerLabel}</span>
          {centerSub && <span className="text-[10px] text-gray-400 mt-0.5">{centerSub}</span>}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-col gap-2 min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className="text-gray-500 truncate">{d.label}</span>
            <span className="font-bold text-gray-800 ml-auto pl-2">
              {d.value}
              {total > 0 && (
                <span className="text-gray-300 font-normal"> · {Math.round((d.value / total) * 100)}%</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Barras verticais (ex.: atendimentos por mês) ─────────────── */
export function BarChart({ data, height = 130, color = '#375337' }) {
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div className="flex items-end gap-2" style={{ height: height + 26 }}>
      {data.map((d, i) => {
        const h = Math.max((d.value / max) * height, d.value > 0 ? 6 : 3)
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
            <span className="text-[10px] font-bold text-gray-600">{d.value > 0 ? d.value : ''}</span>
            <div
              className="w-full rounded-t-lg"
              style={{
                height: h,
                background: d.value > 0 ? color : '#e5e7eb',
                opacity: d.value > 0 ? 0.85 + 0.15 * (d.value / max) : 1,
                transition: 'height 0.5s ease',
              }}
            />
            <span className="text-[10px] text-gray-400 truncate w-full text-center">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Barras horizontais com rótulo (ex.: serviços mais pedidos) ── */
export function HBarList({ data, color = '#375337' }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-600 font-medium truncate pr-2">{d.label}</span>
            <span className="font-bold text-gray-800 flex-shrink-0">{d.value}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, background: color, transition: 'width 0.5s ease' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
