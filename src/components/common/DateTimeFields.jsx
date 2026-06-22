/**
 * DateTimeFields — campos de data e hora em selects separados,
 * substituindo os <input type="date|time"> nativos em todo o app
 * (difíceis de editar/limpar e inconsistentes entre navegadores).
 *
 * <DateFields value="2026-06-12" onChange={iso => ...} fromYear toYear />
 * <TimeField  value="14:30"      onChange={hhmm => ...} step={15} />
 */
import { useState, useEffect, useRef } from 'react'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function parseISO(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!m) return { day: '', month: '', year: '' }
  return { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])) }
}

function daysInMonth(month, year) {
  const m = Number(month)
  if (!m) return 31
  return new Date(Number(year) || 2000, m, 0).getDate()
}

export function DateFields({ value, onChange, fromYear, toYear, noPast = false }) {
  const now = new Date()
  const start = fromYear ?? now.getFullYear()
  const end = toYear ?? now.getFullYear() + 1
  const years = []
  if (start <= end) for (let y = start; y <= end; y++) years.push(y)
  else for (let y = start; y >= end; y--) years.push(y)

  // Estado local para não perder seleções parciais enquanto outros campos estão vazios
  const init = parseISO(value)
  const [day, setDay] = useState(init.day)
  const [month, setMonth] = useState(init.month)
  const [year, setYear] = useState(init.year)
  const prevValue = useRef(value)

  useEffect(() => {
    if (value !== prevValue.current) {
      const p = parseISO(value)
      setDay(p.day); setMonth(p.month); setYear(p.year)
      prevValue.current = value
    }
  }, [value])

  const curY = now.getFullYear(), curM = now.getMonth() + 1, curD = now.getDate()
  const minMonth = noPast && Number(year) === curY ? curM : 1
  const minDay = noPast && Number(year) === curY && Number(month) === curM ? curD : 1

  function emit(d, m, y) {
    if (d && m && y) {
      const safeDay = Math.min(Number(d), daysInMonth(m, y))
      onChange(`${y}-${String(m).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`)
    }
    // Não chama onChange('') para seleções parciais — estado local preserva os valores
  }

  function handleDay(v)   { setDay(v);   emit(v, month, year) }
  function handleMonth(v) { setMonth(v); emit(day, v, year) }
  function handleYear(v)  { setYear(v);  emit(day, month, v) }

  const maxDay = daysInMonth(month, year)
  const days = []
  for (let d = minDay; d <= maxDay; d++) days.push(d)
  const monthOptions = MONTHS.map((name, i) => ({ name, n: i + 1 })).filter(m => m.n >= minMonth)

  return (
    <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
      <div>
        <label className="text-[11px] text-gray-400 mb-1 block">Dia</label>
        <select value={day} onChange={e => handleDay(e.target.value)} className="select-field">
          <option value="">—</option>
          {days.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[11px] text-gray-400 mb-1 block">Mês</label>
        <select value={month} onChange={e => handleMonth(e.target.value)} className="select-field">
          <option value="">—</option>
          {monthOptions.map(m => <option key={m.n} value={m.n}>{m.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[11px] text-gray-400 mb-1 block">Ano</label>
        <select value={year} onChange={e => handleYear(e.target.value)} className="select-field">
          <option value="">—</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </div>
  )
}

export function TimeField({ value, onChange, step = 15, fromHour = 6, toHour = 22, minTime = null }) {
  const m = /^(\d{2}):(\d{2})$/.exec(value || '')
  const hour = m ? String(Number(m[1])) : ''
  const minute = m ? m[2] : ''

  const minH = minTime ? Number(minTime.slice(0, 2)) : -1
  const minM = minTime ? Number(minTime.slice(3, 5)) : -1

  const hours = []
  for (let h = Math.max(fromHour, minH < 0 ? fromHour : minH); h <= toHour; h++) hours.push(h)
  const minutes = []
  for (let mm = 0; mm < 60; mm += step) {
    if (Number(hour) === minH && mm < minM) continue
    minutes.push(String(mm).padStart(2, '0'))
  }

  function emit(h, mm) {
    if (h !== '' && mm !== '') onChange(`${String(h).padStart(2, '0')}:${mm}`)
    else onChange('')
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-[11px] text-gray-400 mb-1 block">Hora</label>
        <select value={hour} onChange={e => emit(e.target.value, minute || '00')} className="select-field">
          <option value="">—</option>
          {hours.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>)}
        </select>
      </div>
      <div>
        <label className="text-[11px] text-gray-400 mb-1 block">Minutos</label>
        <select value={minute} onChange={e => emit(hour, e.target.value)} className="select-field" disabled={hour === ''}>
          <option value="">—</option>
          {minutes.map(mm => <option key={mm} value={mm}>:{mm}</option>)}
        </select>
      </div>
    </div>
  )
}
