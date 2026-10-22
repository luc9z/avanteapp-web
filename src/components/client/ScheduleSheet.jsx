import { useEffect, useState } from 'react'
import {
  doc, getDoc, setDoc, collection, addDoc, getDocs, query, where,
  serverTimestamp, Timestamp, onSnapshot,
} from 'firebase/firestore'
import { db } from '../../firebase'
import Spinner from '../common/Spinner'
import AIButton, { AISuggestion } from '../common/AIButton'
import { showToast } from '../common/Toast'
import AddressSheet from './AddressSheet'
import { directChatId, freshExpiry } from '../../services/directChat'
import { SPECIALTY_TO_SPECIES } from '../../utils/specialties'
import { format, addDays, startOfDay, getDay, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'


/** O horário "HH:mm" já passou, considerando o dia escolhido? */
function jaPassou(hhmm, dia) {
  if (!dia || !isSameDay(dia, new Date())) return false
  const [h, m] = hhmm.split(':').map(Number)
  const agora = new Date()
  return h * 60 + m <= agora.getHours() * 60 + agora.getMinutes()
}

/* ── Gera lista de slots do dia baseado na config de disponibilidade ── */
function generateSlots(dayConfig, slotDuration) {
  if (!dayConfig?.active) return []
  const [sh, sm] = dayConfig.start.split(':').map(Number)
  const [eh, em] = dayConfig.end.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin = eh * 60 + em
  const slots = []
  for (let m = startMin; m + slotDuration <= endMin; m += slotDuration) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    slots.push(`${hh}:${mm}`)
  }
  return slots
}

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/**
 * Agenda usada quando o veterinário não configurou a dele: todo dia, de
 * hora em hora, das 7h às 21h. Antes, sem configuração, a tela trocava
 * para um calendário de mês com lista de horas: o tutor via duas telas
 * diferentes para a mesma etapa, conforme o vet escolhido.
 */
const AGENDA_PADRAO = {
  slotDuration: 60,
  days: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, { active: true, start: '07:00', end: '22:00' }])),
}

const EMOJI = { 'Cão': '🐶', 'Gato': '🐱', 'Bovino': '🐄', 'Equino': '🐴', 'Ave': '🐔', 'Ovino/Caprino': '🐑', 'Suíno': '🐷', 'Outro': '🐾' }

// Ícone (emoji) por categoria de serviço/especialidade
const SERVICE_ICON = {
  'Pequenos animais': '🐶',
  'Bovinos': '🐄',
  'Equinos': '🐴',
  'Aves': '🐔',
  'Exóticos': '🦎',
  'Ovino/Caprino': '🐑',
  'Suíno': '🐷',
  'Cirurgia': '🔪',
  'Dermatologia': '🧴',
  'Oftalmologia': '👁️',
  'Odontologia': '🦷',
  'Cardiologia': '❤️',
  'Oncologia': '🎗️',
  'Reprodução Animal': '🐣',
  'Reprodução': '🐣',
  'Ortopedia': '🦴',
  'Clínico Geral': '🩺',
  'Animais Silvestres': '🦅',
  'Consulta Geral': '🩺',
}
const iconFor = s => SERVICE_ICON[s] || '🩺'


export default function ScheduleSheet({ open, onClose, professional, user, onSuccess, triage }) {
  const [step, setStep] = useState(0)
  const [service, setService] = useState('')
  const [when, setWhen] = useState(null)
  const [notes, setNotes] = useState('')
  // Relato reescrito pela IA, aguardando o tutor aceitar ou descartar.
  const [sugestaoRelato, setSugestaoRelato] = useState('')
  const [symptoms, setSymptoms] = useState('')
  const [properties, setProperties] = useState([])
  const [selectedPropId, setSelectedPropId] = useState(null)
  const [pets, setPets] = useState([])
  const [selectedPetId, setSelectedPetId] = useState(null)
  const [addrOpen, setAddrOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Agenda com slots
  const [vetAvail, setVetAvail] = useState(null) // null = carregando, false = sem config (usa AGENDA_PADRAO)
  const [slotDate, setSlotDate] = useState(null)  // Date selecionada
  const [slotTime, setSlotTime] = useState(null)  // string "HH:mm"
  const [bookedSlots, setBookedSlots] = useState([]) // ["HH:mm", ...]
  const [loadingSlots, setLoadingSlots] = useState(false)

  const services = professional
    ? [...new Set(Array.isArray(professional.specialties) && professional.specialties.length > 0
        ? professional.specialties
        : professional.specialty ? [professional.specialty] : ['Consulta Geral'])]
    : []

  // Espécies que o serviço escolhido implica (para filtrar os animais)
  const speciesForService = SPECIALTY_TO_SPECIES[service] || null
  const filteredPets = speciesForService
    ? pets.filter(p => speciesForService.includes(p.species))
    : pets

  useEffect(() => {
    if (!open || !professional || !user) return
    setStep(0)
    setService(services[0] || 'Consulta Geral')
    setWhen(null)
    setNotes('')
    setSymptoms('')
    setSelectedPetId(null)
    setSelectedPropId(null)
    setSlotDate(null)
    setSlotTime(null)
    setVetAvail(null)

    // Carrega disponibilidade do vet (para modo slots)
    getDoc(doc(db, 'users', professional.uid, 'settings', 'availability'))
      .then(snap => setVetAvail(snap.exists() && snap.data().enabled ? snap.data() : false))
      .catch(() => setVetAvail(false))

    Promise.all([
      getDoc(doc(db, 'users', user.uid, 'private', 'profile')).catch(() => null),
      getDoc(doc(db, 'users', user.uid)).catch(() => null),
    ]).then(([privSnap, mainSnap]) => {
      const priv = privSnap?.exists?.() ? privSnap.data() : {}
      const main = mainSnap?.exists?.() ? mainSnap.data() : {}
      const props = Array.isArray(priv.properties) ? priv.properties
        : Array.isArray(main.properties) ? main.properties : []
      setProperties(props)
      if (props.length === 1) setSelectedPropId(props[0].id)
    }).catch(() => setProperties([]))

    const unsub = onSnapshot(
      collection(db, 'users', user.uid, 'pets'),
      snap => setPets(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setPets([])
    )
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, professional, user])

  const selectedPet = pets.find(p => p.id === selectedPetId) || null
  const selectedProp = properties.find(p => p.id === selectedPropId) || null

  // Quando muda a data selecionada no modo slots, busca quais slots já estão ocupados
  useEffect(() => {
    if (!slotDate || vetAvail === null || !professional?.uid) return
    setLoadingSlots(true)
    setSlotTime(null)
    const dayStart = startOfDay(slotDate)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    getDocs(query(
      collection(db, 'requests'),
      where('professionalId', '==', professional.uid),
      where('requestedTimestamp', '>=', Timestamp.fromDate(dayStart)),
      where('requestedTimestamp', '<', Timestamp.fromDate(dayEnd)),
    )).then(snap => {
      const occupied = snap.docs
        .map(d => d.data())
        .filter(r => !['rejeitado', 'cancelado'].includes(r.status))
        .map(r => r.scheduledSlot || (r.requestedTimestamp?.toDate ? format(r.requestedTimestamp.toDate(), 'HH:mm') : null))
        .filter(Boolean)
      setBookedSlots(occupied)
    }).catch(() => setBookedSlots([])).finally(() => setLoadingSlots(false))
  }, [slotDate, vetAvail, professional?.uid])

  async function handleSaveProperty(prop) {
    const next = [...properties, prop]
    setProperties(next)
    setSelectedPropId(prop.id)
    try {
      await setDoc(doc(db, 'users', user.uid, 'private', 'profile'),
        { properties: next, updatedAt: serverTimestamp() }, { merge: true })
    } catch (e) {
      showToast('Erro ao salvar propriedade: ' + e.message, 'error')
    }
  }

  // Passos: 0=Serviço, 1=Animal, 2=Data, 3=Local, 4=Confirmar
  function goTo(n) { setStep(n) }

  function pickService(s) {
    setService(s)
    setSelectedPetId(null) // espécie pode mudar - reseta animal
    setTimeout(() => setStep(1), 180)
  }
  function pickPet(id) {
    setSelectedPetId(id)
    setTimeout(() => setStep(2), 180)
  }
  function pickProp(id) {
    setSelectedPropId(id)
    setTimeout(() => setStep(4), 180)
  }

  async function handleSubmit() {
    if (!when || !selectedProp) return
    setSubmitting(true)
    try {
      // Múltiplas solicitações ao mesmo vet são permitidas (sem bloqueio de duplicidade)
      const [clientDoc, privDoc] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDoc(doc(db, 'users', user.uid, 'private', 'profile')).catch(() => null),
      ])
      const clientData = clientDoc.data() || {}
      const privData = privDoc?.exists?.() ? privDoc.data() : {}
      const clientPhone = privData.phone || clientData.phone || ''
      const locationText = [selectedProp.label, selectedProp.address].filter(Boolean).join(', ')
      const chatId = directChatId(user.uid, professional.uid)

      const reqRef = await addDoc(collection(db, 'requests'), {
        professionalId: professional.uid,
        professionalName: professional.name || '',
        clientId: user.uid,
        clientName: clientData.name || user.displayName || 'Cliente',
        clientContact: clientPhone,
        service,
        urgency: 'normal',
        notes: notes.trim(),
        intake: symptoms.trim() ? { symptoms: symptoms.trim() } : null,
        requestedTimestamp: Timestamp.fromDate(when),
        requestedTime: format(when, 'HH:mm'),
        status: 'pendente',
        professionalRead: false,
        createdAt: serverTimestamp(),
        chatId,
        location: locationText,
        locationLabel: selectedProp.label,
        locationAddress: selectedProp.address || '',
        client_lat: selectedProp.lat ?? null,
        client_lng: selectedProp.lng ?? null,
        petId: selectedPet?.id || null,
        petName: selectedPet?.name || null,
        petSpecies: selectedPet?.species || null,
        petBreed: selectedPet?.breed || null,
        petWeight: selectedPet?.weight || null,
        petOwnerId: user.uid,
        ...(slotTime ? { scheduledSlot: slotTime } : {}),
        ...(triage ? {
          aiTriage: {
            urgency: triage.urgency,
            specialty: triage.specialty,
            summary: triage.summary,
          }
        } : {}),
        statusHistory: [],
      })

      // Vincula a solicitação ao thread ÚNICO de chat (cliente↔vet)
      await setDoc(doc(db, 'chats', chatId), {
        direct: true,
        participants: [user.uid, professional.uid],
        clientId: user.uid,
        professionalId: professional.uid,
        // Quem abriu. Enquanto ninguém escrever, a conversa só aparece
        // para esta pessoa: o outro lado não deve receber thread vazia.
        createdBy: user.uid,
        clientName: clientData.name || user.displayName || 'Cliente',
        professionalName: professional.name || 'Profissional',
        requestId: reqRef.id,
        service,
        lastRequestStatus: 'pendente',
        expiresAt: freshExpiry(),
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {})

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

  const QUESTIONS = ['Tipo de serviço', 'Qual animal?', 'Data e horário', 'Onde será?', 'Sintomas', 'Confirme tudo']

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        data-coach="schedule-sheet"
        className="bg-white rounded-t-3xl w-full sm:max-w-md sm:mx-auto h-[88vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header com vet + progresso */}
        <div className="px-5 pt-2 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-base">👨‍⚕️</span>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">{professional?.name || 'Profissional'}</p>
                <p className="text-gray-400 text-[11px] truncate">Passo {step + 1} de {QUESTIONS.length}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex gap-1">
            {QUESTIONS.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full flex-1 transition-all ${i <= step ? 'bg-primary' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>

        {/* Pergunta atual */}
        <div className="px-5 pb-2 flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">{QUESTIONS[step]}</h2>
        </div>

        {/* Conteúdo do passo */}
        <div className="px-5 flex-1 overflow-y-auto pb-4">

          {/* ── PASSO 0: Serviço ─────────────────────────────── */}
          {step === 0 && (
            <div className="flex flex-col gap-2 animate-fade-up">
              {services.map(s => {
                const active = s === service
                return (
                  <button key={s} type="button" onClick={() => pickService(s)}
                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                      active ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/30'
                    }`}>
                    <span className="text-2xl flex-shrink-0">{iconFor(s)}</span>
                    <p className={`flex-1 font-bold text-base ${active ? 'text-primary' : 'text-gray-800'}`}>{s}</p>
                    <svg className={`w-5 h-5 flex-shrink-0 ${active ? 'text-primary' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )
              })}
            </div>
          )}

          {/* ── PASSO 1: Animal (opcional) ───────────────────── */}
          {step === 1 && (
            <div className="flex flex-col gap-2 animate-fade-up">
              {speciesForService && (
                <p className="text-xs text-gray-400 mb-1">
                  Animais compatíveis com <strong>{service}</strong>
                </p>
              )}
              {filteredPets.map(p => {
                const active = p.id === selectedPetId
                return (
                  <button key={p.id} type="button" onClick={() => pickPet(p.id)}
                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                      active ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/30'
                    }`}>
                    <span className="text-3xl flex-shrink-0">{EMOJI[p.species] || '🐾'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-base ${active ? 'text-primary' : 'text-gray-800'}`}>{p.name}</p>
                      <p className="text-xs text-gray-400">
                        {[p.species, p.breed, p.weight ? `${p.weight} kg` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <svg className={`w-5 h-5 flex-shrink-0 ${active ? 'text-primary' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )
              })}

              {/* Sem animal cadastrado / pular */}
              <button type="button" onClick={() => { setSelectedPetId(null); setStep(2) }}
                className="flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-gray-200 text-left
                           hover:border-primary/30 transition-all mt-1">
                <div className="flex-1">
                  <p className="font-bold text-sm text-gray-700">Continuar sem animal específico</p>
                  <p className="text-xs text-gray-400">Você descreve nas observações</p>
                </div>
              </button>

              <a href="/pets" onClick={onClose}
                className="text-center text-primary text-sm font-semibold underline py-2 mt-1">
                + Cadastrar novo animal
              </a>
            </div>
          )}

          {/* ── PASSO 2: Data e horário ──────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col gap-4 animate-fade-up">
              {/* Sempre o mesmo carrossel de dias e horários: com a agenda
                  que o vet configurou ou, sem ela, a AGENDA_PADRAO. */}
              {vetAvail === null ? (
                <div className="flex justify-center py-10"><Spinner size={24} color="#375337" /></div>
              ) : (
                <SlotPicker
                  avail={vetAvail || AGENDA_PADRAO}
                  slotDate={slotDate}
                  slotTime={slotTime}
                  bookedSlots={bookedSlots}
                  loadingSlots={loadingSlots}
                  onDateChange={d => { setSlotDate(d); setWhen(null) }}
                  onTimeChange={tm => {
                    setSlotTime(tm)
                    if (slotDate && tm) {
                      const [h, m] = tm.split(':').map(Number)
                      const dt = new Date(slotDate)
                      dt.setHours(h, m, 0, 0)
                      setWhen(dt)
                    }
                  }}
                />
              )}
            </div>
          )}

          {/* ── PASSO 3: Local ───────────────────────────────── */}
          {step === 3 && (
            <div className="flex flex-col gap-2 animate-fade-up">
              {properties.length === 0 ? (
                <div className="bg-gray-50 rounded-2xl px-4 py-8 text-center mt-2">
                  <span className="text-4xl block mb-3">📍</span>
                  <p className="text-sm text-gray-500 mb-3">Nenhum local cadastrado ainda.</p>
                  <button type="button" onClick={() => setAddrOpen(true)} className="btn-primary inline-block px-6 py-2.5 text-sm">
                    Cadastrar local
                  </button>
                </div>
              ) : (
                <>
                  {properties.map(p => {
                    const active = p.id === selectedPropId
                    return (
                      <button key={p.id} type="button" onClick={() => pickProp(p.id)}
                        className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                          active ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/30'
                        }`}>
                            <div className="flex-1 min-w-0">
                          <p className={`font-bold text-base truncate ${active ? 'text-primary' : 'text-gray-800'}`}>{p.label}</p>
                          {p.address && <p className="text-gray-400 text-xs truncate">{p.address}</p>}
                        </div>
                        <svg className={`w-5 h-5 flex-shrink-0 ${active ? 'text-primary' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    )
                  })}
                  <button type="button" onClick={() => setAddrOpen(true)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed
                               border-primary/30 text-primary font-semibold text-sm hover:bg-primary/5 transition-colors mt-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Adicionar novo local
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── PASSO 4: Sintomas / pré-consulta ────────────── */}
          {step === 4 && (
            <div className="flex flex-col gap-4 animate-fade-up">
              <p className="text-sm text-gray-500 -mt-1">
                Descreva o que está acontecendo. Isso ajuda o profissional a se preparar antes da visita.
              </p>
              <div className="flex flex-wrap gap-2">
                {['Sem apetite', 'Febre', 'Vômito', 'Diarreia', 'Apatia', 'Dificuldade de andar', 'Tosse', 'Ferida / inchaço'].map(tag => (
                  <button key={tag} type="button"
                    onClick={() => setSymptoms(prev => prev.includes(tag) ? prev : prev ? `${prev}, ${tag}` : tag)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold border-2 border-gray-200 text-gray-600
                               hover:border-primary/40 hover:bg-primary/5 transition-all">
                    + {tag}
                  </button>
                ))}
              </div>
              <textarea
                value={symptoms}
                onChange={e => setSymptoms(e.target.value)}
                rows={4}
                placeholder="Descreva os sintomas, há quanto tempo, intensidade..."
                className="input-field resize-none text-sm"
              />

              {/* A IA reescreve o relato do tutor no formato que o
                  veterinário lê rápido. Só organiza o que foi dito -
                  sugerir sintoma que a pessoa não relatou seria pior
                  do que não ter o recurso. */}
              {symptoms.trim().length >= 12 && (
                <div className="flex flex-col gap-2">
                  <AIButton
                    mode="descricao"
                    label="Organizar com IA"
                    title="Deixa o relato mais claro para o veterinário, sem mudar o que você contou."
                    className="self-start"
                    build={() => ({ prompt: symptoms.trim() })}
                    onResult={texto => setSugestaoRelato(String(texto).trim())}
                  />
                  {sugestaoRelato && (
                    <AISuggestion
                      onAccept={() => { setSymptoms(sugestaoRelato); setSugestaoRelato('') }}
                      onDiscard={() => setSugestaoRelato('')}
                      acceptLabel="Usar este texto"
                    >
                      {sugestaoRelato}
                    </AISuggestion>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PASSO 5: Resumo ──────────────────────────────── */}
          {step === 5 && (
            <div className="flex flex-col gap-3 animate-fade-up">
              <div className="bg-gray-50 rounded-2xl p-4 flex flex-col gap-3">
                <RowSummary emoji={iconFor(service)} title={service} onEdit={() => goTo(0)} />
                <hr className="border-gray-200" />
                <RowSummary emoji={selectedPet ? (EMOJI[selectedPet.species] || '🐾') : '🐾'}
                  title={selectedPet?.name || 'Sem animal específico'}
                  sub={selectedPet ? [selectedPet.species, selectedPet.breed].filter(Boolean).join(' · ') : null}
                  onEdit={() => goTo(1)} />
                <hr className="border-gray-200" />
                <RowSummary emoji="📅" title={when ? format(when, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '-'} onEdit={() => goTo(2)} />
                <hr className="border-gray-200" />
                <RowSummary emoji="📍" title={selectedProp?.label || '-'} sub={selectedProp?.address} onEdit={() => goTo(3)} />
                {symptoms && (
                  <>
                    <hr className="border-gray-200" />
                    <RowSummary emoji="🩺" title="Pré-consulta" sub={symptoms} onEdit={() => goTo(4)} />
                  </>
                )}
              </div>

              <div>
                <p className="text-sm font-bold text-gray-700 mb-2">Observações adicionais (opcional)</p>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  placeholder="Informações extras para o profissional..."
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none
                             focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-colors" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 pt-2 flex gap-3 flex-shrink-0 border-t border-gray-100">
          {step > 0 && (
            <button type="button" onClick={() => goTo(step - 1)}
              className="px-5 py-3.5 rounded-2xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors">
              Voltar
            </button>
          )}
          {step === 2 && (
            <button type="button" onClick={() => goTo(3)} disabled={!when}
              className="flex-1 btn-primary py-3.5 disabled:opacity-40">Continuar</button>
          )}
          {(step === 0 || step === 1 || step === 3 || step === 4) && (
            <button type="button" onClick={() => goTo(step + 1)}
              disabled={(step === 0 && !service) || (step === 3 && !selectedPropId)}
              className="flex-1 btn-primary py-3.5 disabled:opacity-40">
              {step === 4 && !symptoms ? 'Pular ' : 'Continuar'}
            </button>
          )}
          {step === 5 && (
            <button type="button" onClick={handleSubmit} disabled={submitting}
              className="flex-1 btn-primary py-3.5">
              {submitting ? <Spinner /> : 'Confirmar agendamento'}
            </button>
          )}
        </div>
      </div>

      <AddressSheet open={addrOpen} onClose={() => setAddrOpen(false)} onSave={handleSaveProperty} />
    </div>
  )
}

/* ── Picker de slots ──────────────────────────────────────────── */
function SlotPicker({ avail, slotDate, slotTime, bookedSlots, loadingSlots, onDateChange, onTimeChange }) {
  // Gera próximos 21 dias com pelo menos 1 dia ativo
  const days = []
  const today = startOfDay(new Date())
  for (let i = 0; i <= 30 && days.length < 21; i++) {
    const d = addDays(today, i)
    const dayOfWeek = getDay(d)
    const dayConf = avail.days?.[dayOfWeek]
    if (dayConf?.active) days.push(d)
  }

  // No dia de hoje, horário que já passou não é opção. Sem este filtro
  // dava para agendar às 8h da manhã depois das 20h.
  const slotsDo = d => {
    const conf = d ? avail.days?.[getDay(d)] : null
    return (conf ? generateSlots(conf, avail.slotDuration || 60) : []).filter(t => !jaPassou(t, d))
  }
  const slots = slotsDo(slotDate)

  // Já abre no primeiro dia que ainda tem horário (à noite, hoje não tem):
  // um toque a menos, e a tela nunca começa vazia.
  const primeiroDia = days.find(d => slotsDo(d).length > 0) || null
  useEffect(() => {
    if (!slotDate && primeiroDia) onDateChange(primeiroDia)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotDate, primeiroDia?.getTime()])

  return (
    <div className="flex flex-col gap-4">
      {/* Seletor de data */}
      <div>
        <p className="text-xs font-bold text-gray-500 mb-2">Escolha o dia</p>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5 scrollbar-hide">
          {days.map(d => {
            const isSelected = slotDate && isSameDay(d, slotDate)
            const isToday = isSameDay(d, today)
            return (
              <button key={d.toISOString()} onClick={() => onDateChange(d)}
                className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-2xl border-2 transition-all min-w-[52px] ${
                  isSelected
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white border-gray-200 hover:border-primary/40'
                }`}>
                <span className={`text-[10px] font-bold uppercase ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                  {WEEKDAY_SHORT[getDay(d)]}
                </span>
                <span className="text-lg font-black leading-tight">{format(d, 'd')}</span>
                {isToday && <span className={`text-[9px] ${isSelected ? 'text-white/70' : 'text-primary'}`}>Hoje</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Slots do dia */}
      {slotDate && (
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">
            Horários disponíveis em {format(slotDate, "dd/MM", { locale: ptBR })}
          </p>
          {loadingSlots ? (
            <div className="flex justify-center py-4"><Spinner size={20} color="#375337" /></div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              {isSameDay(slotDate, new Date())
                ? 'Não há mais horários hoje. Escolha outro dia.'
                : 'Nenhum horário disponível neste dia.'}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map(t => {
                const isBooked = bookedSlots.includes(t)
                const isSelected = t === slotTime
                return (
                  <button key={t} onClick={() => !isBooked && onTimeChange(t)} disabled={isBooked}
                    className={`py-3 rounded-2xl text-sm font-bold transition-all ${
                      isBooked
                        ? 'bg-gray-100 text-gray-300 cursor-not-allowed line-through'
                        : isSelected
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-primary/50 active:scale-95'
                    }`}>
                    {t}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {slotDate && slotTime && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 text-center">
          <p className="text-primary font-bold text-sm">
            {format(slotDate, "EEEE, dd 'de' MMMM", { locale: ptBR })} às {slotTime}
          </p>
        </div>
      )}
    </div>
  )
}

/* ── Linha de resumo com botão editar ─────────────────────────── */
function RowSummary({ emoji, title, sub, onEdit }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xl flex-shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-gray-800 truncate">{title}</p>
        {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
      </div>
      <button type="button" onClick={onEdit} className="text-primary text-xs font-bold flex-shrink-0 px-2 py-1">
        Editar
      </button>
    </div>
  )
}
