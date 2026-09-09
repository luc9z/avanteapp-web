import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { VetBottomNav } from '../../components/common/BottomNav'
import { normalizeStatus, isActive } from '../../utils/status'
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

  /**
   * Estado de cada dia do calendário. Um dia com vários atendimentos
   * assume o mais urgente: pendente > em andamento > finalizado - para
   * que o que precisa de ação nunca fique escondido atrás do que já
   * terminou.
   */
  const dayStatus = (() => {
    const rank = { pendente: 3, andamento: 2, finalizado: 1 }
    const map = {}
    for (const a of appointments) {
      const s = normalizeStatus(a.status)
      const kind = s === 'finalizado' ? 'finalizado'
        : s === 'pendente' ? 'pendente'
        : isActive(s) ? 'andamento'
        : 'pendente'
      const key = format(a.date, 'yyyy-MM-dd')
      if (!map[key] || rank[kind] > rank[map[key]]) map[key] = kind
    }
    return map
  })()

  // Cores do dia por estado (fundo tingido em vez de um ponto).
  const DAY_TONE = {
    pendente:   'bg-amber-100 text-amber-700 font-bold',
    andamento:  'bg-blue-100 text-blue-700 font-bold',
    finalizado: 'bg-primary/15 text-primary font-bold',
  }

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
      <div data-coach="agenda-tabs" className="flex mx-4 mt-1 mb-4 bg-gray-100 rounded-2xl p-1">
        {[
          { key: 'agenda', label: 'Calendário' },
          { key: 'disponibilidade', label: 'Disponibilidade' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
              tab === t.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
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
                  const status = dayStatus[key]
                  // Verifica se este dia tem disponibilidade configurada
                  const dayOfWeek = getDay(day)
                  const dayAvail = avail?.days?.[dayOfWeek]
                  const hasSlots = avail?.enabled && dayAvail?.active
                  // Selecionado vence tudo; depois a cor do estado do dia.
                  const tone = isSelected
                    ? 'bg-primary text-white font-bold'
                    : status ? DAY_TONE[status]
                    : isToday ? 'text-primary font-bold'
                    : 'text-gray-700 hover:bg-gray-100'
                  return (
                    <button key={key} onClick={() => setSelectedDate(day)}
                      title={status ? `Atendimento ${status}` : undefined}
                      className={`relative flex items-center justify-center h-9 m-0.5 rounded-xl text-sm transition-all ${tone} ${
                        hasSlots && !isSelected && !status ? 'ring-1 ring-primary/20' : ''
                      } ${isToday && !isSelected ? 'ring-2 ring-primary/40' : ''}`}>
                      {format(day, 'd')}
                    </button>
                  )
                })}
              </div>

              {/* Legenda - sem ela a cor não comunica nada */}
              <div data-coach="agenda-legend" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-gray-100">
                {[
                  ['bg-amber-100', 'Pendente'],
                  ['bg-blue-100', 'Em andamento'],
                  ['bg-primary/15', 'Finalizado'],
                ].map(([bg, label]) => (
                  <span key={label} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <span className={`w-3 h-3 rounded-md ${bg}`} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Atendimentos do dia selecionado */}
            <p className="text-sm font-semibold text-gray-600 mb-3 capitalize">
              {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              {avail?.enabled && avail?.days?.[getDay(selectedDate)]?.active && (
                <span className="ml-2 text-xs text-primary font-normal">
                  ({avail.days[getDay(selectedDate)].start} às {avail.days[getDay(selectedDate)].end})
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

              {/* Toggle on/off - mesmo padrão do "Você está online":
                  a linha inteira é o botão, com o interruptor à direita.
                  É o primeiro passo obrigatório: nada abaixo aparece
                  enquanto ele estiver desligado, e era isso que fazia a
                  tela parecer vazia. */}
              <button
                data-coach="disp-toggle"
                onClick={() => setAvail(a => ({ ...a, enabled: !a.enabled }))}
                className={`btn-row border ${
                  avail.enabled
                    ? 'bg-primary/5 border-primary/30'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="min-w-0">
                  <p className={`font-bold text-sm ${avail.enabled ? 'text-primary' : 'text-gray-700'}`}>
                    Definir meus horários de atendimento
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {avail.enabled
                      ? 'O cliente escolhe só entre os horários que você marcar'
                      : 'Hoje o cliente pode pedir qualquer dia e hora'}
                  </p>
                </div>
                <span className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  avail.enabled ? 'bg-primary' : 'bg-gray-300'
                }`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    avail.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`} />
                </span>
              </button>

              {avail.enabled && (
                <>
                  {/* Duração de cada atendimento */}
                  <div data-coach="disp-duracao" className="card">
                    <p className="text-sm font-bold text-gray-700">Quanto dura cada atendimento?</p>
                    <p className="text-xs text-gray-400 mt-0.5 mb-3">
                      É de quanto em quanto tempo os horários são oferecidos ao cliente.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        [30, '30 min'], [60, '1 hora'], [90, '1h30'], [120, '2 horas'],
                      ].map(([min, label]) => (
                        <button key={min}
                          onClick={() => setAvail(a => ({ ...a, slotDuration: min }))}
                          className={`py-3 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] border-2 min-h-[48px] ${
                            avail.slotDuration === min
                              ? 'bg-primary text-white border-primary'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'
                          }`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Configuração por dia da semana */}
                  <div data-coach="disp-dias" className="card">
                    <p className="text-sm font-bold text-gray-700">Em quais dias você atende?</p>
                    <p className="text-xs text-gray-400 mt-0.5 mb-3">
                      Ligue os dias e diga de que horas até que horas.
                    </p>
                    <div className="flex flex-col gap-2">
                      {[0, 1, 2, 3, 4, 5, 6].map(dayIdx => {
                        const dayConf = avail.days[dayIdx] || { active: false, start: '08:00', end: '18:00' }
                        return (
                          <div key={dayIdx} className={`rounded-2xl border transition-all overflow-hidden ${
                            dayConf.active ? 'border-primary/30 bg-primary/5' : 'border-gray-200 bg-gray-50'
                          }`}>
                            {/* Linha do dia - mesmo padrão do "Você está online" */}
                            <button
                              onClick={() => updateDay(dayIdx, 'active', !dayConf.active)}
                              className="btn-row"
                            >
                              <span className={`text-sm font-bold ${dayConf.active ? 'text-primary' : 'text-gray-500'}`}>
                                {WEEKDAY_FULL[dayIdx]}
                              </span>
                              <span className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                                dayConf.active ? 'bg-primary' : 'bg-gray-300'
                              }`}>
                                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                  dayConf.active ? 'translate-x-[22px]' : 'translate-x-0.5'
                                }`} />
                              </span>
                            </button>

                            {dayConf.active && (
                              <div className="flex items-center gap-2 px-4 pb-3">
                                <div className="flex-1">
                                  <label className="field-label">Das</label>
                                  <input type="time" value={dayConf.start}
                                    onChange={e => updateDay(dayIdx, 'start', e.target.value)}
                                    className="input-field text-center" />
                                </div>
                                <span className="text-gray-400 text-xs font-bold mt-5">até</span>
                                <div className="flex-1">
                                  <label className="field-label">Às</label>
                                  <input type="time" value={dayConf.end}
                                    onChange={e => updateDay(dayIdx, 'end', e.target.value)}
                                    className="input-field text-center" />
                                </div>
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
                className="btn-primary btn-block">
                {savingAvail ? <Spinner /> : 'Salvar disponibilidade'}
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
      <p className="text-xs text-gray-500 mt-0.5">
        horários que o cliente pode escolher por semana
      </p>
      <p className="text-xs text-gray-400 mt-2">
        {activeDays.length} dia{activeDays.length !== 1 ? 's' : ''} de atendimento · {avail.slotDuration} min cada
      </p>
    </div>
  )
}
