import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { VetBottomNav } from '../../components/common/BottomNav'
import { normalizeStatus } from '../../utils/status'
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_LABELS = {
  aceito: { label: 'Aceito', cls: 'badge-accepted' },
  pending: { label: 'Pendente', cls: 'badge-pending' },
  pendente: { label: 'Pendente', cls: 'badge-pending' },
  em_andamento: { label: 'Em andamento', cls: 'bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full' },
  finalizado: { label: 'Finalizado', cls: 'bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full' },
  cancelado: { label: 'Cancelado', cls: 'badge-rejected' },
  rejeitado: { label: 'Rejeitado', cls: 'badge-rejected' },
}

export default function AgendaPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [focusedMonth, setFocusedMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())

  useEffect(() => {
    if (!user?.uid) return
    setLoading(true)
    const unsub = onSnapshot(
      query(
        collection(db, 'requests'),
        where('professionalId', '==', user.uid),
      ),
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
  }, [user?.uid])

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

      <div className="px-4 py-5 pb-nav">
        {/* Calendar header */}
        <div className="card mb-4">
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

          {/* Day names */}
          <div className="grid grid-cols-7 mb-1">
            {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
              <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
            {daysInMonth.map(day => {
              const key = format(day, 'yyyy-MM-dd')
              const isSelected = isSameDay(day, selectedDate)
              const isToday = isSameDay(day, new Date())
              const hasApp = appointmentDays.has(key)
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(day)}
                  className={`relative flex flex-col items-center justify-center py-1.5 rounded-xl text-sm font-medium transition-all ${
                    isSelected ? 'bg-primary text-white' : isToday ? 'text-primary' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {format(day, 'd')}
                  {hasApp && (
                    <span className={`absolute bottom-0.5 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-primary'}`} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected day appointments */}
        <div>
          <p className="text-sm font-semibold text-gray-600 mb-3 capitalize">
            {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>

          {loading && <div className="flex justify-center py-8"><Spinner size={28} color="#375337" /></div>}

          {!loading && appointmentsOnSelected.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <p>Sem atendimentos neste dia</p>
            </div>
          )}

          {!loading && appointmentsOnSelected.map(a => {
            const { label, cls } = STATUS_LABELS[a.status] || { label: a.status, cls: 'badge-pending' }
            return (
              <div
                key={a.id}
                className="card mb-3 cursor-pointer hover:shadow-card-hover transition-shadow"
                onClick={() => navigate(`/request/${a.requestId || a.id}`)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-bold text-primary truncate flex-1">{a.service}</p>
                  <span className={`${cls} flex-shrink-0`}>{label}</span>
                </div>
                <p className="text-gray-500 text-sm truncate">Cliente: {a.clientName}</p>
                {a.location && <p className="text-gray-400 text-xs mt-1 truncate">📍 {a.location}</p>}
                <p className="text-gray-400 text-xs mt-2">
                  {format(a.date, 'HH:mm', { locale: ptBR })}
                </p>
              </div>
            )
          })}
        </div>
      </div>
      <VetBottomNav />
    </div>
  )
}
