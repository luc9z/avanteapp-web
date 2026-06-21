import { useEffect, useState } from 'react'
import {
  doc, getDoc, setDoc, collection, addDoc, getDocs, query, where,
  serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'
import Spinner from '../common/Spinner'
import { showToast } from '../common/Toast'
import AddressSheet from './AddressSheet'
import { format } from 'date-fns'
import DatePicker, { registerLocale } from 'react-datepicker'
import { ptBR } from 'date-fns/locale'
import 'react-datepicker/dist/react-datepicker.css'
import './datepicker.css'

registerLocale('pt-BR', ptBR)

/* ── ScheduleSheet — agendamento de atendimento ───────────────────
   Usado direto na lista de veterinários disponíveis.
   props: { open, onClose, professional, user, onSuccess? }
──────────────────────────────────────────────────────────────────── */
export default function ScheduleSheet({ open, onClose, professional, user, onSuccess }) {
  const [service, setService] = useState('')
  const [when, setWhen] = useState(null)
  const [urgent, setUrgent] = useState(false)
  const [notes, setNotes] = useState('')
  const [properties, setProperties] = useState([])
  const [selectedPropId, setSelectedPropId] = useState(null)
  const [addrOpen, setAddrOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const services = professional
    ? [...new Set(Array.isArray(professional.specialties) && professional.specialties.length > 0
        ? professional.specialties
        : professional.specialty ? [professional.specialty] : ['Consulta Geral'])]
    : []

  useEffect(() => {
    if (open && professional && user) {
      setService(services[0] || 'Consulta Geral')
      setWhen(null)
      setUrgent(false)
      setNotes('')
      getDoc(doc(db, 'users', user.uid)).then(snap => {
        const props = Array.isArray(snap.data()?.properties) ? snap.data().properties : []
        setProperties(props)
        setSelectedPropId(props[0]?.id || null)
      }).catch(() => { setProperties([]); setSelectedPropId(null) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, professional, user])

  const selectedProp = properties.find(p => p.id === selectedPropId) || null

  async function handleSaveProperty(prop) {
    const next = [...properties, prop]
    setProperties(next)
    setSelectedPropId(prop.id)
    try {
      await setDoc(doc(db, 'users', user.uid), { properties: next, updatedAt: serverTimestamp() }, { merge: true })
    } catch (e) {
      showToast('Erro ao salvar propriedade: ' + e.message, 'error')
    }
  }

  async function handleSubmit() {
    if (!when) return showToast('Selecione a data e o horário', 'error')
    if (!selectedProp) return showToast('Selecione ou cadastre o local do atendimento', 'error')
    setSubmitting(true)
    try {
      if (isNaN(when.getTime())) { setSubmitting(false); return showToast('Data ou horário inválido', 'error') }

      const ACTIVE = ['pendente', 'aceito', 'a_caminho', 'em_andamento', 'pausado']
      const dupSnap = await getDocs(query(
        collection(db, 'requests'),
        where('professionalId', '==', professional.uid),
        where('clientId', '==', user.uid),
      ))
      const hasActive = dupSnap.docs.some(d => ACTIVE.includes((d.data().status || '').toLowerCase()))
      if (hasActive) {
        setSubmitting(false)
        return showToast('Você já tem uma solicitação ativa para este profissional.', 'error')
      }

      const clientDoc = await getDoc(doc(db, 'users', user.uid))
      const clientData = clientDoc.data() || {}
      const locationText = [selectedProp.label, selectedProp.address].filter(Boolean).join(' — ')

      await addDoc(collection(db, 'requests'), {
        professionalId: professional.uid,
        professionalName: professional.name || '',
        clientId: user.uid,
        clientName: clientData.name || user.displayName || 'Cliente',
        clientContact: clientData.phone || '',
        service,
        urgency: urgent ? 'urgent' : 'normal',
        notes: notes.trim(),
        requestedTimestamp: Timestamp.fromDate(when),
        requestedTime: format(when, 'HH:mm'),
        status: 'pendente',
        createdAt: serverTimestamp(),
        location: locationText,
        locationLabel: selectedProp.label,
        locationAddress: selectedProp.address || '',
        client_lat: selectedProp.lat ?? null,
        client_lng: selectedProp.lng ?? null,
      })
      showToast('Agendamento enviado! O profissional será notificado.', 'success')
      onSuccess?.()
      onClose()
    } catch (e) {
      showToast('Erro ao enviar: ' + e.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full sm:max-w-md sm:mx-auto max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-2 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-primary/10 p-2.5 rounded-xl flex-shrink-0">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-base truncate">Agendar atendimento</p>
              <p className="text-gray-400 text-xs truncate">com {professional?.name || 'profissional'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 flex flex-col gap-4 pb-6">
          {/* Serviço */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Serviço</p>
            <select value={service} onChange={e => setService(e.target.value)} className="input-field">
              {services.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Data e horário — react-datepicker */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Data e horário</p>
            <DatePicker
              selected={when}
              onChange={setWhen}
              showTimeSelect
              timeIntervals={30}
              minDate={new Date()}
              minTime={when && when.toDateString() === new Date().toDateString()
                ? new Date()
                : new Date(new Date().setHours(0, 0, 0, 0))}
              maxTime={new Date(new Date().setHours(23, 59, 59, 999))}
              locale="pt-BR"
              dateFormat="dd/MM/yyyy 'às' HH:mm"
              timeCaption="Hora"
              placeholderText="Selecione data e horário"
              wrapperClassName="w-full"
              className="input-field cursor-pointer"
              calendarClassName="avante-datepicker"
              popperPlacement="top"
            />
          </div>

          {/* Prioridade */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Prioridade</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setUrgent(false)}
                className={`flex items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                  !urgent ? 'border-primary bg-primary/5' : 'border-gray-200'
                }`}
              >
                <svg className={`w-4 h-4 ${!urgent ? 'text-primary' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className={`text-sm font-bold ${!urgent ? 'text-primary' : 'text-gray-600'}`}>Normal</span>
              </button>
              <button
                type="button"
                onClick={() => setUrgent(true)}
                className={`flex items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                  urgent ? 'border-red-400 bg-red-50' : 'border-gray-200'
                }`}
              >
                <svg className={`w-4 h-4 ${urgent ? 'text-red-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className={`text-sm font-bold ${urgent ? 'text-red-600' : 'text-gray-600'}`}>Urgente</span>
              </button>
            </div>
          </div>

          {/* Local do atendimento */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Local do atendimento</p>
            {properties.length === 0 ? (
              <button
                type="button"
                onClick={() => setAddrOpen(true)}
                className="w-full flex items-center gap-3 p-3.5 bg-primary/5 border-2 border-dashed border-primary/30
                           rounded-2xl hover:bg-primary/10 transition-colors text-left"
              >
                <div className="bg-primary/10 p-2 rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary">Cadastrar propriedade</p>
                  <p className="text-xs text-gray-400">Informe onde o veterinário deve ir</p>
                </div>
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                {properties.map(p => {
                  const active = p.id === selectedPropId
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPropId(p.id)}
                      className={`flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all ${
                        active ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`p-2 rounded-lg flex-shrink-0 ${active ? 'bg-primary/15' : 'bg-gray-100'}`}>
                        <svg className={`w-5 h-5 ${active ? 'text-primary' : 'text-gray-400'}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm truncate ${active ? 'text-primary' : 'text-gray-800'}`}>{p.label}</p>
                        {p.address && <p className="text-gray-400 text-xs truncate">{p.address}</p>}
                      </div>
                      {p.lat != null && (
                        <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                      {active && (
                        <svg className="w-5 h-5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setAddrOpen(true)}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed
                             border-primary/30 text-primary font-semibold text-sm hover:bg-primary/5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Nova propriedade
                </button>
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">Observações (opcional)</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Descreva sintomas, qual animal, informações adicionais..."
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm outline-none
                         focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-colors"
            />
          </div>

          <button onClick={handleSubmit} disabled={submitting} className="btn-primary w-full py-4 mt-1">
            {submitting ? <Spinner /> : 'Confirmar agendamento'}
          </button>
        </div>
      </div>

      <AddressSheet open={addrOpen} onClose={() => setAddrOpen(false)} onSave={handleSaveProperty} />
    </div>
  )
}
