import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { VetBottomNav } from '../../components/common/BottomNav'
import { normalizeStatus } from '../../utils/status'
import { showToast } from '../../components/common/Toast'
import {
  format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_LABELS = {
  aceito:       { label: 'Aceito',       cls: 'badge-accepted' },
  pendente:     { label: 'Pendente',     cls: 'badge-pending' },
  em_andamento: { label: 'Em andamento', cls: 'bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full' },
  finalizado:   { label: 'Finalizado',   cls: 'bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full' },
  rejeitado:    { label: 'Rejeitado',    cls: 'badge-rejected' },
  a_caminho:    { label: 'A caminho',    cls: 'badge-on-way' },
  orcamento:    { label: 'Orçamento',    cls: 'badge-pending' },
}

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const WEEKDAY_FULL  = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const DEFAULT_AVAILABILITY = {
  enabled: false,
  slotDuration: 60,
  days: {
    0: { active: false, start: '08:00', end: '18:00' },
    1: { active: true,  start: '08:00', end: '18:00' },
    2: { active: true,  start: '08:00', end: '18:00' },
    3: { active: true,  start: '08:00', end: '18:00' },
    4: { active: true,  start: '08:00', end: '18:00' },
    5: { active: true,  start: '08:00', end: '18:00' },
    6: { active: false, start: '08:00', end: '18:00' },
  },
}

export default function AgendaPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid

  const [tab, setTab] = useState('agenda') // 'agenda' | 'disponibilidade'
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [focusedMonth, setFocusedMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())

  // Disponibilidade
  const [avail, setAvail] = useState(null)
  const [savingAvail, setSavingAvail] = useState(false)

  // Carrega agendamentos
  useEffect(() => {
    if (!uid) return
    setLoading(true)
    const unsub = onSnapshot(
      query(collection(db, 'requests'), where('professionalId', '==', uid)),
      snap => {
        const EXCLUDE = ['cancelado', 'rejeitado']
        setAppointments(snap.docs
          .map(d => {
            const data = d.data()
            const ts = data.requestedTimestamp
            const date = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null)
            return { id: d.id, ...data, date, status: normalizeStatus(data.status) }
          })
          .filter(r => r.date && !EXCLUDE.includes(r.status))
        )
        setLoading(false)
      },
      () => setLoading(false)
    )
    return unsub
  }, [uid])

  // Carrega config de disponibilidade
  useEffect(() => {
    if (!uid) return
    getDoc(doc(db, 'users', uid, 'settings', 'availability')).then(snap => {
      if (snap.exists()) {
        const d = snap.data()
        // Garante que days tem todas as chaves 0-6
        const days = { ...DEFAULT_AVAILABILITY.days, ...(d.days || {}) }
        setAvail({ ...DEFAULT_AVAILABILITY, ...d, days })
      } else {
        setAvail({ ...DEFAULT_AVAILABILITY })
      }
    }).catch(() => setAvail({ ...DEFAULT_AVAILABILITY }))
  }, [uid])

  async function saveAvailability() {
    if (!avail || !uid) return
    setSavingAvail(true)
    try {
      await setDoc(doc(db, 'users', uid, 'settings', 'availability'), {
        ...avail,
        updatedAt: serverTimestamp(),
      })
      showToast('Disponibilidade salva!', 'success')
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message, 'error')
    } finally {
      setSavingAvail(false)
    }
  }

  function updateDay(dayIdx, field, value) {
    setAvail(a => ({
      ...a,
      days: { ...a.days, [dayIdx]: { ...a.days[dayIdx], [field]: value } },
    }))
  }

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(focusedMonth),
    end: endOfMonth(focusedMonth),
  })
  const firstDayOfWeek = getDay(startOfMonth(focusedMonth))
  const appointmentsOnSelected = appointments.filter(a => isSameDay(a.date, selectedDate))
  const appointmentDays = new Set(appointments.map(a => format(a.date, 'yyyy-MM-dd')))

  return (
    <div className="page-container">
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="page-title">Agenda</h1>
        <div className="w-6" />
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mt-1 mb-4 bg-gray-100 rounded-2xl p-1">
        {[
          { key: 'agenda', label: 'Calendário' },
          { key: 'disponibilidade', label: 'Disponibilidade' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === t.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="pb-nav px-4">

        {/* ── TAB AGENDA ── */}
        {tab === 'agenda' && (
          <>
            <div className="card mb-4">
              {/* Navegação do mês */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setFocusedMonth(m => subMonths(m, 1))}
                  className="p-2 rounded-full hover:bg-gray-100 text-primary">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <p className="font-bold text-primary capitalize">
                  {format(focusedMonth, 'MMMM yyyy', { locale: ptBR })}
                </p>
                <button onClick={() => setFocusedMonth(m => addMonths(m, 1))}
                  className="p-2 rounded-full hover:bg-gray-100 text-primary">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Nomes dos dias */}
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAY_NAMES.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
                ))}
              </div>

              {/* Dias do mês */}
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
                {daysInMonth.map(day => {
                  const key = format(day, 'yyyy-MM-dd')
                  const isSelected = isSameDay(day, selectedDate)
                  const isToday = isSameDay(day, new Date())
                  const hasApp = appointmentDays.has(key)
                  // Verifica se este dia tem disponibilidade configurada
                  const dayOfWeek = getDay(day)
                  const dayAvail = avail?.days?.[dayOfWeek]
                  const hasSlots = avail?.enabled && dayAvail?.active
                  return (
                    <button key={key} onClick={() => setSelectedDate(day)}
                      className={`relative flex flex-col items-center justify-center py-1.5 rounded-xl text-sm font-medium transition-all ${
                        isSelected ? 'bg-primary text-white' : isToday ? 'text-primary' : 'text-gray-700 hover:bg-gray-100'
                      } ${hasSlots && !isSelected ? 'ring-1 ring-primary/20' : ''}`}>
                      {format(day, 'd')}
                      {hasApp && (
                        <span className={`absolute bottom-0.5 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-primary'}`} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Atendimentos do dia selecionado */}
            <p className="text-sm font-semibold text-gray-600 mb-3 capitalize">
              {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              {avail?.enabled && avail?.days?.[getDay(selectedDate)]?.active && (
                <span className="ml-2 text-xs text-primary font-normal">
                  ({avail.days[getDay(selectedDate)].start}–{avail.days[getDay(selectedDate)].end})
                </span>
              )}
            </p>

            {loading && <div className="flex justify-center py-8"><Spinner size={28} color="#375337" /></div>}

            {!loading && appointmentsOnSelected.length === 0 && (
              <div className="card text-center py-10 text-gray-400">
                <p>Sem atendimentos neste dia</p>
              </div>
            )}

            {!loading && appointmentsOnSelected.map(a => {
              const { label, cls } = STATUS_LABELS[a.status] || { label: a.status, cls: 'badge-pending' }
              return (
                <div key={a.id}
                  className="card mb-3 cursor-pointer hover:shadow-card-hover transition-shadow"
                  onClick={() => navigate(`/request/${a.requestId || a.id}`)}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="font-bold text-primary truncate flex-1">{a.service}</p>
                    <span className={`${cls} flex-shrink-0`}>{label}</span>
                  </div>
                  <p className="text-gray-500 text-sm truncate">Cliente: {a.clientName}</p>
                  {a.location && <p className="text-gray-400 text-xs mt-1 truncate">📍 {a.location}</p>}
                  <p className="text-gray-400 text-xs mt-2">
                    {a.scheduledSlot
                      ? format(new Date(a.scheduledSlot), 'HH:mm')
                      : format(a.date, 'HH:mm', { locale: ptBR })}
                  </p>
                </div>
              )
            })}
          </>
        )}

        {/* ── TAB DISPONIBILIDADE ── */}
        {tab === 'disponibilidade' && (
          avail === null ? (
            <div className="flex justify-center py-16"><Spinner size={28} color="#375337" /></div>
          ) : (
            <div className="flex flex-col gap-4">

              {/* Toggle on/off */}
              <div className="card flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-800 text-sm">Agenda com slots</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {avail.enabled
                      ? 'Clientes veem apenas seus horários disponíveis'
                      : 'Clientes escolhem qualquer data e hora'}
                  </p>
                </div>
                <button
                  onClick={() => setAvail(a => ({ ...a, enabled: !a.enabled }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${avail.enabled ? 'bg-primary' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${avail.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {avail.enabled && (
                <>
                  {/* Duração dos slots */}
                  <div className="card">
                    <p className="text-sm font-bold text-gray-700 mb-3">Duração de cada slot</p>
                    <div className="flex gap-2">
                      {[30, 60, 90, 120].map(min => (
                        <button key={min}
                          onClick={() => setAvail(a => ({ ...a, slotDuration: min }))}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                            avail.slotDuration === min
                              ? 'bg-primary text-white border-primary'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'
                          }`}>
                          {min}min
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Configuração por dia da semana */}
                  <div className="card">
                    <p className="text-sm font-bold text-gray-700 mb-3">Horários por dia da semana</p>
                    <div className="flex flex-col gap-3">
                      {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => {
                        const dayConf = avail.days[dayIdx] || { active: false, start: '08:00', end: '18:00' }
                        return (
                          <div key={dayIdx} className={`rounded-2xl border p-3 transition-all ${
                            dayConf.active ? 'border-primary/30 bg-primary/3' : 'border-gray-100 bg-gray-50'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <p className={`text-sm font-bold ${dayConf.active ? 'text-primary' : 'text-gray-400'}`}>
                                {WEEKDAY_FULL[dayIdx]}
                              </p>
                              <button
                                onClick={() => updateDay(dayIdx, 'active', !dayConf.active)}
                                className={`relative w-10 h-5 rounded-full transition-colors ${dayConf.active ? 'bg-primary' : 'bg-gray-300'}`}>
                                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${dayConf.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                              </button>
                            </div>
                            {dayConf.active && (
                              <div className="flex items-center gap-2 mt-2">
                                <input type="time" value={dayConf.start}
                                  onChange={e => updateDay(dayIdx, 'start', e.target.value)}
                                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center outline-none focus:border-primary" />
                                <span className="text-gray-400 text-xs font-bold">até</span>
                                <input type="time" value={dayConf.end}
                                  onChange={e => updateDay(dayIdx, 'end', e.target.value)}
                                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center outline-none focus:border-primary" />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Preview de slots */}
                  <SlotPreview avail={avail} />
                </>
              )}

              <button onClick={saveAvailability} disabled={savingAvail}
                className="btn-primary w-full flex items-center justify-center gap-2 py-4">
                {savingAvail ? <Spinner /> : '💾 Salvar disponibilidade'}
              </button>
            </div>
          )
        )}
      </div>
      <VetBottomNav />
    </div>
  )
}

/* Preview quantos slots gera por semana */
function SlotPreview({ avail }) {
  const activeDays = Object.entries(avail.days).filter(([, d]) => d.active)
  if (activeDays.length === 0) return null

  const totalSlots = activeDays.reduce((sum, [, d]) => {
    const [sh, sm] = d.start.split(':').map(Number)
    const [eh, em] = d.end.split(':').map(Number)
    const totalMin = (eh * 60 + em) - (sh * 60 + sm)
    return sum + Math.floor(totalMin / avail.slotDuration)
  }, 0)

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 text-center">
      <p className="text-2xl font-black text-primary">{totalSlots}</p>
      <p className="text-xs text-gray-500 mt-0.5">slots disponíveis por semana</p>
      <p className="text-xs text-gray-400 mt-2">
        {activeDays.length} dia{activeDays.length !== 1 ? 's' : ''} ativo{activeDays.length !== 1 ? 's' : ''} · slots de {avail.slotDuration} min
      </p>
    </div>
  )
}
