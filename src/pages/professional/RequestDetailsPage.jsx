import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  doc, onSnapshot, getDoc, updateDoc, addDoc,
  collection, serverTimestamp, deleteField, arrayUnion, query, orderBy, limit,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import AIButton, { AISuggestion } from '../../components/common/AIButton'
import { showToast } from '../../components/common/Toast'
import { friendlyError } from '../../utils/errors'
import { VetBottomNav, ClientBottomNav } from '../../components/common/BottomNav'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { distanceKm, formatKm } from '../../utils/geo'
import { normalizeStatus, statusInfo } from '../../utils/status'
import { PetRecords } from '../client/PetsPage'
import { directChatId } from '../../services/directChat'
import useVetTracking from '../../hooks/useVetTracking'
import VetTrackingMap from '../../components/shared/VetTrackingMap'

/* ── Horizontal 4-step tracker ──────────────────────────────────
   1 Pendente → 2 Aceito → 3 Em Andamento → 4 Finalizado
──────────────────────────────────────────────────────────────── */
const H_STEPS = ['Pendente', 'Aceito', 'Em Andamento', 'Finalizado']

/**
 * Em que etapa o atendimento está.
 *
 * O passo 1 significa "ainda esperando o veterinário aceitar", e é ele
 * que faz aparecerem os botões Recusar/Aceitar. Por isso NENHUM status
 * desconhecido pode cair no 1: quando 'orcamento' caía no fallback, o
 * botão Aceitar voltava depois do orçamento enviado e um clique
 * devolvia a solicitação para 'aceito', jogando fora o orçamento.
 *
 * A normalização é a de utils/status.js - antes esta página mantinha um
 * vocabulário próprio, que foi justamente o que divergiu.
 */
function hStepIndex(status) {
  const s = normalizeStatus(status)
  if (s === 'finalizado') return 4
  if (['em_andamento', 'pausado'].includes(s)) return 3
  if (['aceito', 'a_caminho', 'orcamento', 'orcamento_recusado', 'aguardando'].includes(s)) return 2
  if (['pendente', 'urgente'].includes(s)) return 1
  // Recusado não tem etapa: a tela trata por isRejected. Listado aqui só
  // para não disparar o aviso de status desconhecido.
  if (s === 'rejeitado') return 1
  // Status novo que ninguém mapeou: trata como em andamento. Errar para
  // "já aceito" é inofensivo; errar para "pendente" apaga trabalho.
  console.warn('[atendimento] status não mapeado:', status)
  return 2
}

/* ── Status badge config ─────────────────────────────────────── */
/**
 * O selo do topo do atendimento.
 *
 * Só as cores moram aqui - esta tela usa selo sólido, as listas usam
 * selo suave. O TEXTO sai de statusInfo(): quando cada tela tinha o
 * próprio mapa, um status novo aparecia cru em algumas e certo em
 * outras.
 */
const CORES_SELO = {
  pendente:           'bg-amber-400 text-white',
  urgente:            'bg-red-500 text-white',
  aceito:             'bg-green-500 text-white',
  a_caminho:          'bg-blue-400 text-white',
  orcamento:          'bg-amber-500 text-white',
  orcamento_recusado: 'bg-red-500 text-white',
  aguardando:         'bg-amber-400 text-white',
  em_andamento:       'bg-blue-500 text-white',
  pausado:            'bg-orange-400 text-white',
  rejeitado:          'bg-red-500 text-white',
  finalizado:         'bg-gray-200 text-gray-700',
}

function statusBadge(status) {
  const s = normalizeStatus(status)
  return {
    label: statusInfo(status).label,
    cls: CORES_SELO[s] || 'bg-gray-400 text-white',
  }
}

function formatDateTime(ts) {
  if (!ts) return '-'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

/* ── Confirm dialog ──────────────────────────────────────────── */
function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
      onClick={onCancel}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">{message}</p>
        <div className="flex items-center justify-end gap-4">
          <button onClick={onCancel}
            className="text-gray-500 font-medium text-sm hover:text-gray-700 px-2 py-1">
            Cancelar
          </button>
          <button onClick={onConfirm}
            className="bg-primary text-white font-bold text-sm px-6 py-2.5 rounded-xl
                       hover:bg-primary-600 active:scale-95 transition-all">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────── */
export default function RequestDetailsPage({ idEmbutido, embutido = false }) {
  // Embutida, recebe o id por prop; como página, lê da URL.
  const { id: idDaRota } = useParams()
  const id = idEmbutido || idDaRota
  const { user } = useAuth()
  const navigate = useNavigate()

  const [req, setReq] = useState(null)
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [vetNotes, setVetNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [vetDistKm, setVetDistKm] = useState(null)
  const [prescriptionForm, setPrescriptionForm] = useState({ medicamento: '', dose: '', posologia: '', validade: '' })
  const [savingPrescription, setSavingPrescription] = useState(false)
  const [prescriptionOpen, setPrescriptionOpen] = useState(false)
  const notesInitRef = useRef(false)

  // Vet GPS: ativo só quando status = a_caminho e o usuário é o profissional
  useVetTracking(id, !!(user?.uid && user.uid === req?.professionalId &&
    normalizeStatus(req?.status) === 'a_caminho'))

  useEffect(() => {
    if (!id) return
    const unsub = onSnapshot(doc(db, 'requests', id), snap => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() }
        setReq(data)
        if (data.clientId) loadClient(data.clientId)
        // Marca como visualizado pelo veterinário (some o badge de não lido)
        if (data.professionalId === user?.uid && data.professionalRead === false) {
          updateDoc(doc(db, 'requests', id), { professionalRead: true }).catch(() => {})
        }
      }
      setLoading(false)
    })
    return unsub
  }, [id, user?.uid])

  async function loadClient(clientId) {
    try {
      const snap = await getDoc(doc(db, 'users', clientId))
      if (snap.exists()) setClient(snap.data())
    } catch (_) {}
  }

  // Init notas do vet uma vez ao carregar
  useEffect(() => {
    if (!notesInitRef.current && req?.vetNotes != null) {
      setVetNotes(req.vetNotes)
      notesInitRef.current = true
    }
  }, [req?.vetNotes])

  // Distância vet → cliente (uma vez, quando vet visualiza)
  useEffect(() => {
    if (!req?.client_lat || user?.uid !== req?.professionalId) return
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const d = distanceKm(coords.latitude, coords.longitude, req.client_lat, req.client_lng)
        setVetDistKm(d)
      },
      () => {},
      { timeout: 6000, maximumAge: 30000 }
    )
  }, [req?.client_lat, req?.client_lng, req?.professionalId, user?.uid])

  function askConfirm(title, message, action) {
    setDialog({ title, message, action })
  }

  function handleDialogConfirm() {
    const action = dialog?.action
    setDialog(null)
    action?.()
  }

  async function acceptRequest() {
    setAccepting(true)
    try {
      const appRef = await addDoc(collection(db, 'appointments'), {
        professionalId: req.professionalId,
        clientId: req.clientId,
        clientName: req.clientName,
        service: req.service,
        location: req.location,
        date: req.requestedTimestamp || serverTimestamp(),
        requestId: id,
        status: 'aceito',
        createdAt: serverTimestamp(),
      })
      await updateDoc(doc(db, 'requests', id), {
        status: 'aceito',
        appointmentId: appRef.id,
        statusHistory: [
          ...(req?.statusHistory || []),
          { status: 'aceito', at: new Date().toISOString() },
        ],
      })
      showToast('Solicitação aceita!', 'success')
    } catch (e) { showToast(friendlyError(e), 'error') }
    finally { setAccepting(false) }
  }

  async function rejectRequest() {
    setRejecting(true)
    try {
      await updateDoc(doc(db, 'requests', id), { status: 'rejeitado' })
      showToast('Solicitação recusada.', 'info')
      navigate(-1)
    } catch (e) { showToast(friendlyError(e), 'error') }
    finally { setRejecting(false) }
  }

  async function updateStatus(newStatus) {
    setUpdating(true)
    try {
      const updates = { status: newStatus }
      if (newStatus === 'finalizado') {
        updates.confirmFinish_professional = true
        updates.confirmFinish_client = false
        updates.finalizedAt = serverTimestamp()
      }
      if ((req?.status || '').toLowerCase() === 'a_caminho' && newStatus !== 'a_caminho') {
        updates.vetLocation = deleteField()
      }
      updates.statusHistory = [
        ...(req?.statusHistory || []),
        { status: newStatus, at: new Date().toISOString() },
      ]
      await updateDoc(doc(db, 'requests', id), updates)
      if (req?.appointmentId) {
        const apptUpdates = { status: newStatus, updatedAt: serverTimestamp() }
        if (newStatus === 'finalizado') {
          apptUpdates.confirmFinish_professional = true
          apptUpdates.confirmFinish_client = false
          apptUpdates.finalizedAt = serverTimestamp()
        }
        await updateDoc(doc(db, 'appointments', req.appointmentId), apptUpdates).catch(() => {})
      }
    } catch (e) { showToast(friendlyError(e), 'error') }
    finally { setUpdating(false) }
  }

  async function saveVetNotes() {
    setSavingNotes(true)
    try {
      await updateDoc(doc(db, 'requests', id), { vetNotes })
      showToast('Anotações salvas.', 'success')
    } catch (e) { showToast(friendlyError(e), 'error') }
    finally { setSavingNotes(false) }
  }

  async function savePrescription() {
    if (!prescriptionForm.medicamento.trim()) return showToast('Informe o medicamento', 'error')
    if (!prescriptionForm.dose.trim()) return showToast('Informe a dose', 'error')
    setSavingPrescription(true)
    try {
      await updateDoc(doc(db, 'requests', id), {
        prescription: {
          ...prescriptionForm,
          issuedAt: new Date().toISOString(),
          vetName: req.professionalName || '',
        }
      })
      showToast('Receita emitida ✓', 'success')
      setPrescriptionOpen(false)
    } catch (e) { showToast(friendlyError(e), 'error') }
    finally { setSavingPrescription(false) }
  }



  const STATUS_CONFIRM = {
    a_caminho:    { title: 'A Caminho', message: 'Confirmar que você está a caminho do cliente?' },
    em_andamento: { title: 'Iniciar Atendimento', message: 'O atendimento será iniciado. O cliente poderá acompanhar em tempo real.' },
    pausado:      { title: 'Pausar Atendimento', message: 'Deseja pausar o atendimento?' },
    finalizado:   { title: 'Encerrar Atendimento', message: 'Confirmar o encerramento? Esta ação não pode ser desfeita.' },
  }

  function triggerStatus(newStatus) {
    const c = STATUS_CONFIRM[newStatus]
    if (c) askConfirm(c.title, c.message, () => updateStatus(newStatus))
    else updateStatus(newStatus)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen"><Spinner size={32} color="#375337" /></div>
  )
  if (!req) return (
    <div className={embutido ? '' : 'page-container largura-leitura'}>
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="page-title">Detalhes</h1>
        <div className="w-6" />
      </div>
      <p className="text-center py-16 text-gray-400">Solicitação não encontrada</p>
    </div>
  )

  const status = normalizeStatus(req.status)
  const urgency = (req.urgency || '').toLowerCase()
  const currentHStep = hStepIndex(status)
  const isRejected = status === 'rejeitado'
  // 'Pendente' aqui significa 'esperando a resposta do veterinario'. Uma
  // solicitacao ja recusada nao espera resposta nenhuma - sem esta
  // exclusao a tela mostrava o painel 'Solicitacao recusada' e os botoes
  // Recusar/Aceitar ao mesmo tempo.
  const isPending = currentHStep === 1 && !isRejected
  const isFinished = currentHStep === 4
  const isProf = user?.uid === req.professionalId
  const isActiveStatus = currentHStep >= 2 && currentHStep < 4
  const isEmergency = req.isUrgent === true || urgency === 'urgent' || status === 'urgente'

  const badge = statusBadge(status)

  const requestedAt = req.requestedTimestamp?.toDate?.() || null
  const timeSince = requestedAt
    ? formatDistanceToNow(requestedAt, { locale: ptBR, addSuffix: true })
    : null

  // Map URL: prefer exact GPS coords, else fall back to address/label text
  const mapUrl = req.client_lat != null
    ? `https://maps.google.com/maps?q=${req.client_lat},${req.client_lng}`
    : `https://maps.google.com/maps?q=${encodeURIComponent(req.locationAddress || req.location || req.locationLabel || '')}`

  return (
    <>
      <div className={embutido ? 'w-full' : 'page-container'}>
        {/* ── Green Header ─────────────────────────────────── */}
        <div className={`bg-primary px-4 pt-4 pb-6 ${embutido ? 'rounded-t-3xl' : ''}`}>
          {/* Topbar row */}
          <div className="flex items-center justify-between mb-4">
            {/* Embutida, a lista continua visível ao lado: voltar não
                faz sentido e o espaço fica para o título. */}
            {embutido ? <div className="w-6" /> : (
              <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <p className="font-semibold text-white text-base">Detalhes do Atendimento</p>
            <div className="w-6" />
          </div>

          {/* Client row */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-bold text-white flex-shrink-0">
              {(req.clientName || '?')[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-base leading-tight truncate">{req.clientName || 'Cliente'}</p>
              <p className="text-white/70 text-sm truncate">{req.service}</p>
            </div>
            {/* Status badge */}
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0 ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
        </div>

        <div className="px-4 py-4 flex flex-col gap-4 pb-nav">

          {/* ── Horizontal step tracker ──────────────────────────────
               Each step is flex-1 + items-center. Connectors use
               absolute half-left / half-right so labels always sit
               exactly centred under their own circle, regardless of
               screen width or label length.
          ─────────────────────────────────────────────────────── */}
          {!isRejected && (
            <div className="card px-2 pt-5 pb-4">
              <div className="flex">
                {H_STEPS.map((label, i) => {
                  const stepNum = i + 1
                  const done    = currentHStep >= stepNum
                  const isFirst = i === 0
                  const isLast  = i === H_STEPS.length - 1

                  return (
                    <div key={label} className="flex-1 flex flex-col items-center relative">

                      {/* ← left half-connector (to previous step) */}
                      {!isFirst && (
                        <div className={`absolute top-[18px] left-0 right-1/2 h-0.5 ${
                          currentHStep > i ? 'bg-primary' : 'bg-gray-200'
                        }`} />
                      )}

                      {/* → right half-connector (to next step) */}
                      {!isLast && (
                        <div className={`absolute top-[18px] left-1/2 right-0 h-0.5 ${
                          currentHStep > stepNum ? 'bg-primary' : 'bg-gray-200'
                        }`} />
                      )}

                      {/* Circle */}
                      <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center
                                       flex-shrink-0 transition-all ${done ? 'bg-primary' : 'bg-gray-100'}`}>
                        {done ? (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="text-xs font-bold text-gray-400">{stepNum}</span>
                        )}
                      </div>

                      {/* Label - centred under the circle */}
                      <p className={`mt-2 text-[9px] font-semibold text-center leading-tight w-full px-0.5 ${
                        done ? 'text-primary' : 'text-gray-400'
                      }`}>
                        {label}
                      </p>

                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── GPS: mapa ao vivo (cliente) / banner GPS ativo (vet) ── */}
          {status === 'a_caminho' && !isProf && (
            <VetTrackingMap
              vetLocation={req.vetLocation}
              clientLat={req.client_lat}
              clientLng={req.client_lng}
            />
          )}
          {status === 'a_caminho' && isProf && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-green-50 border border-green-200">
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <div>
                <p className="text-sm font-bold text-green-700">GPS ativo</p>
                <p className="text-xs text-green-600">Compartilhando localização com o cliente em tempo real.</p>
              </div>
            </div>
          )}

          {/* ── Service details card ──────────────────────── */}
          <div className="card flex flex-col divide-y divide-gray-50">
            {/* Serviço */}
            <div className="flex items-start gap-3 py-3">
              <div className="bg-primary/8 p-2 rounded-lg flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-400">Serviço</p>
                <p className="font-bold text-gray-900 text-sm">{req.service}</p>
              </div>
            </div>

            {/* Data/Hora */}
            {req.requestedTimestamp && (
              <div className="flex items-start gap-3 py-3">
                <div className="bg-primary/8 p-2 rounded-lg flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Data/Hora</p>
                  <p className="font-bold text-gray-900 text-sm">{formatDateTime(req.requestedTimestamp)}</p>
                  {timeSince && <p className="text-xs text-gray-400 mt-0.5">{timeSince}</p>}
                </div>
              </div>
            )}

            {/* Distância (vet → cliente, só pro vet) */}
            {isProf && vetDistKm != null && (
              <div className="flex items-start gap-3 py-3">
                <div className="bg-primary/8 p-2 rounded-lg flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Distância até o cliente</p>
                  <p className="font-bold text-gray-900 text-sm">{formatKm(vetDistKm)}</p>
                </div>
              </div>
            )}

            {/* Urgência */}
            <div className="flex items-start gap-3 py-3">
              <div className="bg-primary/8 p-2 rounded-lg flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-400">Urgência</p>
                <p className={`font-bold text-sm uppercase ${urgency === 'urgent' ? 'text-red-500' : 'text-amber-500'}`}>
                  {urgency === 'urgent' ? 'URGENTE' : 'NORMAL'}
                </p>
              </div>
            </div>

            {/* Location */}
            {(req.locationLabel || req.location) && (
              <div className="flex items-start gap-3 py-3">
                <div className="bg-primary/8 p-2 rounded-lg flex-shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">Local do atendimento</p>
                  <p className="font-bold text-gray-900 text-sm">{req.locationLabel || req.location}</p>
                  {req.locationAddress && <p className="text-gray-500 text-xs mt-0.5">{req.locationAddress}</p>}
                  <a href={mapUrl}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-primary text-xs font-semibold hover:underline">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    {req.client_lat != null ? 'Abrir rota exata (GPS)' : 'Abrir no mapa'}
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* ── Animal do atendimento + histórico clínico ──── */}
          {req.petId && req.petOwnerId && (
            <PetBlock req={req} isProf={isProf} userUid={user?.uid} />
          )}

          {/* ── Observações ───────────────────────────────── */}
          {req.notes && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                <p className="font-bold text-gray-800 text-sm">Observações</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                <p className="text-gray-700 text-sm leading-relaxed">{req.notes}</p>
              </div>
            </div>
          )}

          {/* ── Histórico de status ───────────────────────── */}
          <StatusTimeline req={req} />

          {/* ── Notas privadas do vet ─────────────────────── */}
          {isProf && isActiveStatus && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <p className="font-bold text-gray-800 text-sm">Anotações (visível só para você)</p>
              </div>
              <div className="card flex flex-col gap-2 p-3">
                <textarea
                  value={vetNotes}
                  onChange={e => setVetNotes(e.target.value)}
                  placeholder="Ex.: Animal calmo, necessita sedação leve. Dono pediu receituário..."
                  rows={3}
                  className="w-full text-sm text-gray-700 placeholder-gray-400 resize-none outline-none
                             leading-relaxed bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5"
                />
                <div className="flex justify-end">
                  <button onClick={saveVetNotes} disabled={savingNotes}
                    className="text-xs font-bold text-primary px-4 py-1.5 rounded-lg
                               hover:bg-primary/5 transition-colors disabled:opacity-50">
                    {savingNotes ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Receita digital ──────────────────────────── */}
          {isProf && (isActiveStatus || isFinished) && !req.prescription && (
            <div>
              <button
                onClick={() => setPrescriptionOpen(o => !o)}
                className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {prescriptionOpen ? 'Fechar receita' : 'Emitir receita'}
              </button>
              {prescriptionOpen && (
                <div className="card flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="field-label">Medicamento</label>
                      <input value={prescriptionForm.medicamento}
                        onChange={e => setPrescriptionForm(f => ({ ...f, medicamento: e.target.value }))}
                        className="input-field" placeholder="Amoxicilina 500mg..." />
                    </div>
                    <div>
                      <label className="field-label">Dose / quantidade</label>
                      <input value={prescriptionForm.dose}
                        onChange={e => setPrescriptionForm(f => ({ ...f, dose: e.target.value }))}
                        className="input-field" placeholder="1 comprimido" />
                    </div>
                    <div>
                      <label className="field-label">Validade (dias)</label>
                      <input type="number" min="1" value={prescriptionForm.validade}
                        onChange={e => setPrescriptionForm(f => ({ ...f, validade: e.target.value }))}
                        className="input-field" placeholder="30" />
                    </div>
                    <div className="col-span-2">
                      <label className="field-label">Posologia</label>
                      <textarea rows={2} value={prescriptionForm.posologia}
                        onChange={e => setPrescriptionForm(f => ({ ...f, posologia: e.target.value }))}
                        className="input-field resize-none text-sm"
                        placeholder="1x ao dia por 7 dias, junto com alimentação..." />
                    </div>
                  </div>
                  <button onClick={savePrescription} disabled={savingPrescription} className="btn-primary">
                    {savingPrescription ? <Spinner /> : 'Emitir receita'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Receita emitida - leitura para vet e cliente */}
          {req.prescription && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="font-bold text-gray-800 text-sm">Receita médica veterinária</p>
              </div>
              <div className="card flex flex-col gap-2 border-l-4 border-primary">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-gray-900 text-sm">{req.prescription.medicamento}</p>
                  {req.prescription.validade && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
                      {req.prescription.validade}d
                    </span>
                  )}
                </div>
                {req.prescription.dose && <p className="text-sm text-gray-600">Dose: {req.prescription.dose}</p>}
                {req.prescription.posologia && <p className="text-sm text-gray-600">{req.prescription.posologia}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  Dr(a). {req.prescription.vetName}
                  {req.prescription.issuedAt ? ` · ${format(new Date(req.prescription.issuedAt), 'dd/MM/yyyy')}` : ''}
                </p>
              </div>
            </div>
          )}

          {/* ── Dados do cliente ──────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <p className="font-bold text-gray-800 text-sm">Dados do Cliente</p>
            </div>
            <div className="card flex flex-col divide-y divide-gray-50">
              {(client?.name || req.clientName) && (
                <ClientRow
                  iconPath="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  label="Nome" value={client?.name || req.clientName}
                />
              )}
              {client?.phone && (
                <ClientRow
                  iconPath="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  label="Telefone" value={client.phone}
                />
              )}
              {(client?.email || req.clientContact) && (
                <ClientRow
                  iconPath="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  label="E-mail" value={client?.email || req.clientContact}
                  href={`mailto:${client?.email || req.clientContact}`}
                />
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════
               ACTION AREA
               Layout (matches mobile):
               1. Abrir Chat  - green filled, always first (except pending/rejected)
               2. Status-specific action buttons - all dark green
               3. Finalizado card + confirmation chips
               4. Rate button (client only)
          ═══════════════════════════════════════════════════════ */}
          <div className="flex flex-col gap-3 mt-1">

            {/* ── Rejected ─────────────────────────────────── */}
            {isRejected && (
              <div className="flex flex-col items-center gap-2 py-6 bg-red-50 rounded-2xl">
                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="font-semibold text-red-500">Solicitação recusada</p>
              </div>
            )}

            {/* ── Abrir Chat - ALWAYS first (green filled) ─── */}
            {!isPending && !isRejected && (
              <button
                onClick={() => navigate(`/chat/${req?.chatId || directChatId(req.clientId, req.professionalId)}`)}
                className="btn-primary w-full py-4 gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Abrir Chat
              </button>
            )}

            {/* ── Professional-only action buttons ─────────── */}
            {isProf && (
              <>
                {/* EMERGÊNCIA em atendimento: encerrar direto, sem o
                    fluxo de visita domiciliar (a_caminho → iniciar → ...). */}
                {isEmergency && isActiveStatus && (
                  <GreenBtn
                    onClick={() => triggerStatus('finalizado')}
                    disabled={updating} loading={updating}
                    iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    label="Finalizar atendimento" />
                )}

                {/* PENDING: accept / reject */}
                {isPending && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => askConfirm('Recusar Solicitação', 'Tem certeza que deseja recusar esta solicitação?', rejectRequest)}
                      disabled={rejecting || accepting}
                      className="flex-1 py-4 rounded-2xl border-2 border-red-400 text-red-500 font-bold text-sm
                                 flex items-center justify-center gap-2 hover:bg-red-50 transition-all
                                 active:scale-95 disabled:opacity-50"
                    >
                      {rejecting ? <Spinner /> : (
                        <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>Recusar</>
                      )}
                    </button>
                    <button
                      onClick={() => askConfirm('Aceitar Solicitação', 'Confirmar o aceite desta solicitação?', acceptRequest)}
                      disabled={accepting || rejecting}
                      className="flex-1 py-4 rounded-2xl bg-primary text-white font-bold text-sm
                                 flex items-center justify-center gap-2 hover:bg-primary-600 transition-all
                                 active:scale-95 disabled:opacity-50"
                    >
                      {accepting ? <Spinner /> : (
                        <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>Aceitar</>
                      )}
                    </button>
                  </div>
                )}

                {/* ACEITO → Enviar Orçamento OU A Caminho */}
                {status === 'aceito' && isProf && (
                  <div className="flex flex-col gap-2">
                    <QuoteComposer requestId={id} req={req} onSent={() => {}} primario />
                    <button
                      onClick={() => askConfirm(
                        'Ir sem enviar orçamento',
                        'O cliente não vai aprovar nenhum valor antes da visita. Você combina o preço pessoalmente. Continuar?',
                        () => updateStatus('a_caminho'),
                      )}
                      disabled={updating}
                      className="w-full py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700
                                 disabled:opacity-50 transition-colors"
                    >
                      {updating ? <Spinner /> : 'Ir sem enviar orçamento'}
                    </button>
                  </div>
                )}
                {status === 'orcamento' && isProf && (
                  <p className="text-center text-sm text-gray-500 py-3">Aguardando aprovação do orçamento pelo cliente</p>
                )}

                {/* ORÇAMENTO RECUSADO: refazer a proposta ou encerrar */}
                {status === 'orcamento_recusado' && isProf && (
                  <div className="flex flex-col gap-3">
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                      <p className="text-sm font-bold text-red-700">O cliente recusou o orçamento</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Você pode enviar uma proposta nova com outro valor, ou encerrar o pedido.
                      </p>
                      {req.quote?.total != null && (
                        <p className="text-xs text-gray-500 mt-1.5">
                          Proposta recusada: R$ {Number(req.quote.total).toFixed(2).replace('.', ',')}
                        </p>
                      )}
                    </div>

                    <QuoteComposer requestId={id} req={req} rotulo="Atualizar proposta" onSent={() => {}} />

                    <button
                      onClick={() => askConfirm(
                        'Recusar pedido',
                        'O atendimento será encerrado e o cliente avisado. Não há como desfazer.',
                        rejectRequest,
                      )}
                      disabled={rejecting}
                      className="btn-danger btn-block"
                    >
                      {rejecting ? <Spinner /> : 'Recusar pedido'}
                    </button>
                  </div>
                )}

                {/* A_CAMINHO → Iniciar */}
                {status === 'a_caminho' && (
                  <GreenBtn onClick={() => triggerStatus('em_andamento')} disabled={updating} loading={updating}
                    iconPath="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    label="Iniciar Atendimento" />
                )}

                {/* EM_ANDAMENTO → Pausar + Finalizar */}
                {(status === 'em_andamento' || status === 'in_progress') && (
                  <div className="flex gap-3">
                    <GreenBtn onClick={() => triggerStatus('pausado')} disabled={updating} loading={updating}
                      iconFill="M6 19h4V5H6v14zm8-14v14h4V5h-4z"
                      label="Pausar" flex1 />
                    <GreenBtn onClick={() => triggerStatus('finalizado')} disabled={updating} loading={updating}
                      iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      label="Finalizar" flex1 />
                  </div>
                )}

                {/* PAUSADO → Retomar + Finalizar */}
                {(status === 'pausado' || status === 'paused') && (
                  <div className="flex gap-3">
                    <GreenBtn onClick={() => triggerStatus('em_andamento')} disabled={updating} loading={updating}
                      iconFill="M8 5v14l11-7z"
                      label="Retomar" flex1 />
                    <GreenBtn onClick={() => triggerStatus('finalizado')} disabled={updating} loading={updating}
                      iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      label="Finalizar" flex1 />
                  </div>
                )}
              </>
            )}

            {/* O cliente vê que a bola está com o veterinário */}
            {status === 'orcamento_recusado' && !isProf && (
              <p className="text-center text-sm text-gray-500 py-3">
                Você recusou o orçamento. O veterinário pode enviar uma proposta nova.
              </p>
            )}

            {/* ── Cliente: aguardando orçamento / deslocamento ─── */}
            {status === 'aceito' && !isProf && (
              <p className="text-center text-sm text-gray-500 py-3">Aguardando orçamento ou deslocamento do veterinário</p>
            )}

            {/* ── Cliente: vê e aprova/recusa o orçamento ──────── */}
            {status === 'orcamento' && !isProf && req.quote && (
              <QuoteViewer
                quote={req.quote}
                onApprove={async () => {
                  await updateDoc(doc(db, 'requests', id), {
                    status: 'a_caminho',
                    'quote.approvedAt': new Date().toISOString(),
                    statusHistory: [...(req.statusHistory || []), { status: 'a_caminho', at: new Date().toISOString() }],
                  }).catch(() => showToast('Erro ao aprovar orçamento', 'error'))
                }}
                onReject={async () => {
                  /* Guarda a proposta recusada em vez de apagar: o
                     veterinário precisa dela para montar a próxima, e
                     sumir com ela deixava os dois sem referência. */
                  await updateDoc(doc(db, 'requests', id), {
                    status: 'orcamento_recusado',
                    'quote.rejectedAt': new Date().toISOString(),
                    statusHistory: [...(req.statusHistory || []),
                      { status: 'orcamento_recusado', at: new Date().toISOString() }],
                  }).catch(() => showToast('Erro ao recusar orçamento', 'error'))
                }}
              />
            )}

            {/* ── Finalizado: confirmation + rating flow ────── */}
            {isFinished && (
              <FinalizadoCard
                req={req}
                isClient={user?.uid === req.clientId}
                isProf={isProf}
                onClientConfirm={async () => {
                  try {
                    // A confirmação do cliente encerra o atendimento -
                    // falhar em silêncio deixaria o pedido preso.
                    await updateDoc(doc(db, 'requests', id), { confirmFinish_client: true })
                    if (req.appointmentId) {
                      await updateDoc(doc(db, 'appointments', req.appointmentId), { confirmFinish_client: true })
                        .catch(() => {})   // espelho do agendamento: não bloqueia
                    }
                  } catch (e) {
                    showToast(friendlyError(e, 'Não foi possível confirmar. Tente novamente.'), 'error')
                  }
                }}
                onRate={() => navigate(`/rate/${id}`)}
              />
            )}

            {/* O vet marca que recebeu: mede os atendimentos PAGOS vindos do app
                (a meta do Vet Fundador conta a confirmação do cliente). */}
            {isFinished && isProf && (
              <PaymentReceivedCard
                received={req.paymentReceived === true}
                onConfirm={async () => {
                  try {
                    await updateDoc(doc(db, 'requests', id), {
                      paymentReceived: true,
                      paymentReceivedAt: serverTimestamp(),
                    })
                    showToast('Pagamento registrado.', 'success')
                  } catch (e) { showToast(friendlyError(e), 'error') }
                }}
              />
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title || ''}
        message={dialog?.message || ''}
        onConfirm={handleDialogConfirm}
        onCancel={() => setDialog(null)}
      />
      {!embutido && req && (user?.uid === req.clientId ? <ClientBottomNav /> : <VetBottomNav />)}
    </>
  )
}

function ClientRow({ iconPath, label, value, href }) {
  const inner = (
    <div className="flex items-center gap-3 py-3">
      <div className="bg-gray-50 p-2 rounded-lg flex-shrink-0">
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
        </svg>
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
  if (href) return <a href={href} className="hover:opacity-75 transition-opacity block">{inner}</a>
  return <div>{inner}</div>
}


/* ── Reusable coloured action button ─────────────────────────── */
/* ── GreenBtn - unified dark-green action button ─────────────── */
function GreenBtn({ onClick, disabled, loading, iconPath, iconFill, label, flex1 }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${flex1 ? 'flex-1' : 'w-full'} py-4 rounded-2xl bg-primary hover:bg-primary-600
                  active:bg-primary-700 text-white font-bold text-sm
                  flex items-center justify-center gap-2 transition-all
                  active:scale-95 disabled:opacity-50`}
    >
      {loading ? <Spinner size={18} color="white" /> : (
        <>
          {iconFill
            ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d={iconFill} /></svg>
            : iconPath
              ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
                </svg>
              : null
          }
          {label}
        </>
      )}
    </button>
  )
}

/* ── FinalizadoCard - handles the full post-finish flow ──────────
   States:
   A) client NOT confirmed → orange "aguardando" + (client) confirm CTA / (prof) waiting note
   B) client confirmed, NOT rated → green "concluído" + (client) rate CTA
   C) rated → "avaliado" note
──────────────────────────────────────────────────────────────── */
/* ── Pagamento recebido (só o veterinário vê) ───────────────────
   O valor da visita é combinado e pago direto ao vet; este registro só
   serve para medir quantos atendimentos pagos vieram pelo app.
──────────────────────────────────────────────────────────────── */
function PaymentReceivedCard({ received, onConfirm }) {
  const [saving, setSaving] = useState(false)

  if (received) {
    return (
      <p className="text-center text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
        ✓ Pagamento da visita registrado
      </p>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
      <p className="flex-1 text-xs text-gray-600 leading-relaxed">
        O cliente já pagou a visita? Registrar ajuda a medir os atendimentos que vieram pelo app.
      </p>
      <button
        onClick={async () => { setSaving(true); try { await onConfirm() } finally { setSaving(false) } }}
        disabled={saving}
        className="px-4 min-h-[44px] rounded-xl bg-primary text-white text-xs font-bold whitespace-nowrap
                   hover:bg-primary-600 disabled:opacity-50 transition-colors"
      >
        {saving ? <Spinner size={14} color="white" /> : 'Recebi o pagamento'}
      </button>
    </div>
  )
}

function FinalizadoCard({ req, isClient, isProf, onClientConfirm, onRate }) {
  const [confirming, setConfirming] = useState(false)

  // Professional finalizing implies professional confirmed.
  const profConfirmed = true
  const clientConfirmed = req.confirmFinish_client === true
  const rated = req.rated === true

  async function handleClientConfirm() {
    setConfirming(true)
    try { await onClientConfirm() }
    finally { setConfirming(false) }
  }

  /* ── State C: already rated ──────────────────────────────── */
  if (rated) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col items-center gap-2 py-6 rounded-2xl bg-green-50 border border-green-200">
          <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-bold text-green-700 text-sm">Atendimento concluído e avaliado</p>
        </div>
        <PdfButton req={req} />
      </div>
    )
  }

  /* ── State B: client confirmed, awaiting rating ──────────── */
  if (clientConfirmed) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-2xl bg-green-50 border border-green-200 px-4 py-4">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-green-700 text-sm">Atendimento concluído!</p>
            <p className="text-green-600 text-xs mt-0.5">
              {isClient ? 'Que tal avaliar o profissional?' : 'O cliente confirmou o atendimento.'}
            </p>
          </div>
        </div>

        <PdfButton req={req} />

        {/* Client rate CTA */}
        {isClient && (
          <button
            onClick={onRate}
            className="w-full py-4 rounded-2xl bg-yellow-400 hover:bg-yellow-500 text-white font-bold text-sm
                       flex items-center justify-center gap-2 transition-colors active:scale-95"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            Avaliar Atendimento
          </button>
        )}
      </div>
    )
  }

  /* ── State A: awaiting client confirmation ───────────────── */
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4">
        <div className="flex flex-col items-center text-center gap-2.5 mb-4">
          <div className="w-11 h-11 rounded-full bg-orange-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="font-bold text-orange-600 text-sm">
            {isClient ? 'Confirme o atendimento' : 'Aguardando confirmação do cliente'}
          </p>
          <p className="text-gray-500 text-xs leading-relaxed max-w-xs mx-auto">
            {isClient
              ? 'O profissional encerrou o atendimento. Confirme para concluir e avaliar.'
              : 'O cliente deve confirmar o atendimento. Caso não confirme em 2 dias, será finalizado automaticamente.'}
          </p>
        </div>

        <div className="flex gap-2 justify-center">
          <ConfirmChip filled={profConfirmed} label="Profissional" />
          <ConfirmChip filled={clientConfirmed} label="Cliente" />
        </div>
      </div>

      {/* Client confirm CTA - green & enabled */}
      {isClient && (
        <button
          onClick={handleClientConfirm}
          disabled={confirming}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-sm
                     flex items-center justify-center gap-2 hover:bg-primary-600
                     transition-colors active:scale-95 disabled:opacity-60"
        >
          {confirming ? <Spinner size={18} color="white" /> : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Confirmar Atendimento
            </>
          )}
        </button>
      )}
    </div>
  )
}

function ConfirmChip({ filled, label }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
      filled
        ? 'bg-primary border-primary text-white'
        : 'bg-white border-gray-300 text-gray-400'
    }`}>
      <div className={`w-2 h-2 rounded-full ${filled ? 'bg-white' : 'border border-gray-400'}`} />
      {label}
    </div>
  )
}


/* ── Bloco do animal + histórico clínico ─────────────────────────
   O veterinário pode ADICIONAR registros (vacina, medicação, achados)
   durante ou após o atendimento; ficam no prontuário do pet. ──── */
function PetBlock({ req, isProf, userUid }) {
  // 'notas' = anotações livres do atendimento; 'prontuario' = histórico
  // clínico do animal. Antes o prontuário abria outra página e o
  // veterinário perdia o atendimento de vista no meio da consulta.
  const [aba, setAba] = useState(null)
  const ownerId = req.petOwnerId || req.clientId

  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 21s-6.716-4.35-8.657-8.232C1.79 9.61 3.13 6 6.5 6c1.79 0 3.02 1.02 3.75 2.02L12 9.75l1.75-1.73C14.48 7.02 15.71 6 17.5 6c3.37 0 4.71 3.61 3.157 6.768C18.716 16.65 12 21 12 21z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-800 text-sm truncate">{req.petName}</p>
          <p className="text-xs text-gray-500 truncate">{req.petSpecies || 'Animal'}</p>
        </div>

        {/* Os dois botões usam a MESMA caixa. Antes um era <button> e o
            outro <a>, e a altura mínima global não vale para link inline
            - por isso desalinhavam. */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <PetTab ativo={aba === 'notas'} onClick={() => setAba(a => a === 'notas' ? null : 'notas')}>
            Notas
          </PetTab>
          <PetTab ativo={aba === 'prontuario'} onClick={() => setAba(a => a === 'prontuario' ? null : 'prontuario')}>
            Prontuário
          </PetTab>
        </div>
      </div>

      {aba === 'notas' && (
        <PetRecords
          ownerId={req.petOwnerId}
          petId={req.petId}
          canAdd={isProf}
          professionalId={isProf ? userUid : null}
          authorName={isProf ? (req.professionalName || 'Veterinário') : ''}
        />
      )}

      {aba === 'prontuario' && (
        <ProntuarioPreview petId={req.petId} ownerId={ownerId} />
      )}
    </div>
  )
}

/** Botão de aba do bloco do animal - caixa única, para os dois alinharem. */
function PetTab({ ativo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 px-3 rounded-full text-xs font-bold leading-none
                  inline-flex items-center justify-center whitespace-nowrap
                  transition-all duration-200 hover:-translate-y-px active:translate-y-0
                  ${ativo
                    ? 'bg-primary text-white'
                    : 'text-primary hover:bg-primary/5'}`}
    >
      {children}
    </button>
  )
}

/**
 * Prévia do prontuário dentro do atendimento.
 *
 * Mostra as últimas entradas do histórico clínico sem tirar o
 * veterinário da tela do atendimento. O prontuário completo continua
 * existindo - o link no rodapé leva até ele quando for preciso editar.
 */
function ProntuarioPreview({ petId, ownerId }) {
  const [entradas, setEntradas] = useState(null)

  useEffect(() => {
    if (!petId) return
    return onSnapshot(
      query(collection(db, 'medicalRecords', petId, 'entries'), orderBy('date', 'desc'), limit(5)),
      snap => setEntradas(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => { console.error('[prontuário] prévia:', e); setEntradas([]) },
    )
  }, [petId])

  const linkCompleto = `/medical-record/${petId}?owner=${ownerId}`

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2 animate-fade-up">
      {entradas === null ? (
        <div className="flex justify-center py-4"><Spinner size={18} color="#375337" /></div>
      ) : entradas.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-3">
          Este animal ainda não tem histórico clínico.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entradas.map(e => {
            const t = ENTRY_TYPES[e.type] || ENTRY_TYPES.consulta
            return (
              <div key={e.id} className="flex items-start gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5">
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ${t.cor}`}>
                  {t.rotulo}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">{e.title || t.rotulo}</p>
                  <p className="text-[11px] text-gray-500">
                    {formatEntryDate(e.date)}
                    {e.vetName ? ` · ${e.vetName}` : ''}
                  </p>
                  {e.notes && (
                    <p className="text-[11px] text-gray-600 mt-1 line-clamp-2 leading-relaxed">{e.notes}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Link to={linkCompleto}
        className="btn-outline btn-sm btn-block no-underline mt-1">
        Abrir prontuário completo
      </Link>
    </div>
  )
}

/** Rótulo e cor por tipo de entrada, espelhando o prontuário completo. */
const ENTRY_TYPES = {
  consulta:    { rotulo: 'Consulta',    cor: 'text-blue-600 bg-blue-50' },
  vacina:      { rotulo: 'Vacina',      cor: 'text-green-600 bg-green-50' },
  exame:       { rotulo: 'Exame',       cor: 'text-purple-600 bg-purple-50' },
  medicamento: { rotulo: 'Medicamento', cor: 'text-orange-600 bg-orange-50' },
  cirurgia:    { rotulo: 'Cirurgia',    cor: 'text-red-600 bg-red-50' },
}

/** A data da entrada pode vir como Timestamp ou string ISO. */
function formatEntryDate(d) {
  try {
    const data = d?.toDate ? d.toDate() : d ? new Date(d) : null
    return data && !isNaN(data) ? format(data, 'dd/MM/yyyy') : '-'
  } catch { return '-' }
}


/** Rótulo do histórico. Sem 'orcamento' no mapa, a linha do tempo
 *  mostrava o valor cru do banco, em minúsculas. */
function statusLabel(s) {
  return statusInfo(s).label
}

function StatusTimeline({ req }) {
  const entries = (req.statusHistory || []).map(h => ({
    label: statusLabel(h.status),
    at: new Date(h.at),
  }))

  if (entries.length < 1) return null

  return (
    <div className="card">
      <p className="font-bold text-gray-800 text-sm mb-4">Histórico</p>
      <div className="flex flex-col">
        {entries.map((e, i) => {
          const isLast = i === entries.length - 1
          return (
            <div key={i} className="flex items-start gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-2.5 h-2.5 rounded-full mt-0.5 ${isLast ? 'bg-primary' : 'bg-gray-300'}`} />
                {!isLast && <div className="w-px h-7 bg-gray-200 mt-0.5" />}
              </div>
              <div className="pb-3">
                <p className={`text-sm font-semibold ${isLast ? 'text-primary' : 'text-gray-700'}`}>{e.label}</p>
                <p className="text-xs text-gray-400">
                  {format(e.at, "dd/MM 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PdfButton({ req }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      onClick={async () => { setBusy(true); try { await downloadReceiptPDF(req) } finally { setBusy(false) } }}
      disabled={busy}
      className="w-full py-3 rounded-2xl border-2 border-primary/30 text-primary font-bold text-sm
                 flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors active:scale-95"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {busy ? 'Gerando PDF...' : 'Baixar comprovante (PDF)'}
    </button>
  )
}

/* ── Comprovante em PDF (atendimento finalizado) ───────────────── */
export async function downloadReceiptPDF(req) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF()
  const W = pdf.internal.pageSize.getWidth()
  let y = 22

  pdf.setFillColor(55, 83, 55)
  pdf.rect(0, 0, W, 30, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(16); pdf.setFont(undefined, 'bold')
  pdf.text('Avante - Comprovante de Atendimento', 14, 19)

  y = 44
  pdf.setTextColor(40, 40, 40)
  pdf.setFontSize(11); pdf.setFont(undefined, 'normal')

  const when = req.requestedTimestamp?.toDate?.()
  const rows = [
    ['Serviço', req.service || 'Atendimento veterinário'],
    ['Profissional', req.professionalName || '-'],
    ['Cliente', req.clientName || '-'],
    ['Animal', req.petName ? `${req.petName} (${req.petSpecies || ''})` : '-'],
    ['Data do atendimento', when ? format(when, "dd/MM/yyyy 'às' HH:mm") : '-'],
    ['Local', req.location || '-'],
    ['Status', 'Finalizado'],
    ['Código', req.id || '-'],
  ]

  rows.forEach(([label, value]) => {
    pdf.setFont(undefined, 'bold');   pdf.text(`${label}:`, 14, y)
    pdf.setFont(undefined, 'normal')
    const lines = pdf.splitTextToSize(String(value), W - 70)
    pdf.text(lines, 62, y)
    y += 8 + (lines.length - 1) * 6
  })

  if (req.notes) {
    y += 4
    pdf.setFont(undefined, 'bold'); pdf.text('Observações:', 14, y); y += 7
    pdf.setFont(undefined, 'normal')
    pdf.text(pdf.splitTextToSize(req.notes, W - 28), 14, y)
    y += 14
  }

  y = Math.max(y + 10, 200)
  pdf.setDrawColor(220); pdf.line(14, y, W - 14, y); y += 8
  pdf.setFontSize(9); pdf.setTextColor(130)
  pdf.text(`Documento gerado pelo app AVANTE em ${format(new Date(), 'dd/MM/yyyy HH:mm')}.`, 14, y)
  pdf.text('Este comprovante não substitui receituário ou atestado veterinário.', 14, y + 5)

  pdf.save(`avante-atendimento-${(req.id || 'comprovante').slice(0, 8)}.pdf`)
}


/* ── QuoteComposer - vet envia orçamento ─────────────────────── */
/** Valor em reais no formato brasileiro (R$ 180,00, não R$ 180.00). */
const reais = v => (Number(v) || 0).toFixed(2).replace('.', ',')

function QuoteComposer({ requestId, req, onSent, rotulo = 'Enviar Orçamento', primario = false }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([{ desc: '', qty: 1, price: '' }])
  const [saving, setSaving] = useState(false)
  // Sugestão da IA aguardando decisão. Nunca entra direto nos itens:
  // um orçamento errado vai para o cliente e vira preço combinado.
  const [sugestao, setSugestao] = useState(null)

  function addItem() { setItems(prev => [...prev, { desc: '', qty: 1, price: '' }]) }
  function removeItem(i) { setItems(prev => prev.filter((_, idx) => idx !== i)) }
  function updateItem(i, field, val) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))
  }

  const total = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0)

  async function handleSend() {
    if (items.some(i => !i.desc.trim() || !i.price)) return showToast('Preencha todos os itens', 'error')
    setSaving(true)
    try {
      await updateDoc(doc(db, 'requests', requestId), {
        status: 'orcamento',
        // rejectedAt sai junto: é proposta nova, não a recusada de antes.
        quote: { items, total, sentAt: new Date().toISOString(), approvedAt: null, rejectedAt: null },
        statusHistory: arrayUnion({ status: 'orcamento', at: new Date().toISOString() }),
      })
      showToast('Orçamento enviado ao cliente!', 'success')
      setOpen(false)
      onSent()
    } catch { showToast('Erro ao enviar orçamento', 'error') } finally { setSaving(false) }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className={`w-full rounded-xl font-semibold text-sm flex items-center justify-center
                  gap-2 transition-colors ${primario
        ? 'py-4 bg-primary text-white font-bold hover:bg-primary-600 active:scale-95'
        : 'py-2.5 border-2 border-primary/40 text-primary hover:bg-primary/5'}`}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      {rotulo}
    </button>
  )

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-primary text-sm">Orçamento</p>
        <AIButton
          mode="orcamento"
          json
          label="Sugerir com IA"
          title="A IA monta uma proposta a partir do pedido; você confere e ajusta."
          build={() => ({
            prompt: [
              req?.serviceType && `Serviço: ${req.serviceType}`,
              req?.petName && `Animal: ${req.petName}`,
              req?.description && `Relato: ${req.description}`,
            ].filter(Boolean).join('. ') || 'Atendimento veterinário domiciliar',
            context: {
              servico: req?.serviceType,
              animal: req?.petName,
              descricao: req?.description || req?.notes,
              cidade: req?.locationAddress,
            },
          })}
          onResult={r => {
            const lista = Array.isArray(r?.items) ? r.items : []
            if (!lista.length) return showToast('A IA não conseguiu montar um orçamento.', 'error')
            setSugestao({
              items: lista.slice(0, 6).map(i => ({
                desc: String(i.desc || '').slice(0, 80),
                qty: Number(i.qty) > 0 ? Number(i.qty) : 1,
                price: Number(i.price) > 0 ? String(Number(i.price).toFixed(2)) : '',
              })),
              observacao: String(r?.observacao || ''),
            })
          }}
        />
      </div>

      {sugestao && (
        <AISuggestion
          onAccept={() => { setItems(sugestao.items); setSugestao(null) }}
          onDiscard={() => setSugestao(null)}
          acceptLabel="Preencher orçamento"
        >
          <ul className="flex flex-col gap-1">
            {sugestao.items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-3">
                <span className="truncate">{i.desc}{i.qty > 1 ? ` × ${i.qty}` : ''}</span>
                <span className="font-semibold flex-shrink-0">{i.price ? `R$ ${reais(i.price)}` : 'R$ -'}</span>
              </li>
            ))}
          </ul>
          {sugestao.observacao && (
            <p className="text-xs text-gray-500 mt-2">{sugestao.observacao}</p>
          )}
        </AISuggestion>
      )}

      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input value={item.desc} onChange={e => updateItem(i, 'desc', e.target.value)}
            placeholder="Serviço / produto" className="input-field text-sm flex-1" />
          <input value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)}
            type="number" min={1} className="input-field text-sm w-14" />
          <input value={item.price} onChange={e => updateItem(i, 'price', e.target.value)}
            placeholder="R$" type="number" className="input-field text-sm w-20" />
          {items.length > 1 && (
            <button onClick={() => removeItem(i)} className="text-gray-400 hover:text-red-500 p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}
      <button onClick={addItem} className="text-xs text-primary font-semibold hover:underline text-left">
        + Adicionar item
      </button>
      <div className="flex items-center justify-between border-t border-primary/20 pt-2">
        <p className="text-sm font-bold text-gray-800">Total: R$ {reais(total)}</p>
        <div className="flex gap-2">
          <button onClick={() => setOpen(false)} className="text-xs text-gray-400 px-3 py-1.5 hover:text-gray-600">Cancelar</button>
          <button onClick={handleSend} disabled={saving}
            className="btn-primary text-xs px-4 py-1.5 rounded-lg disabled:opacity-50">
            {saving ? '...' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── QuoteViewer - cliente vê e aprova orçamento ─────────────── */
function QuoteViewer({ quote, onApprove, onReject }) {
  const [approving, setApproving] = useState(false)
  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 flex flex-col gap-3">
      <p className="font-bold text-amber-800 text-sm">Orçamento recebido</p>
      <div className="flex flex-col gap-1.5">
        {quote.items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-700">{item.desc} {item.qty > 1 ? `× ${item.qty}` : ''}</span>
            <span className="font-semibold text-gray-800">R$ {reais(Number(item.price) * Number(item.qty))}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-amber-200 pt-2 font-bold">
          <span className="text-gray-800">Total</span>
          <span className="text-primary">R$ {reais(quote.total)}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onReject} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 text-sm font-semibold hover:bg-gray-50">
          Recusar
        </button>
        <button
          onClick={async () => { setApproving(true); await onApprove(); setApproving(false) }}
          disabled={approving}
          className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-600 disabled:opacity-60"
        >
          {approving ? '...' : 'Aprovar e confirmar'}
        </button>
      </div>
    </div>
  )
}
