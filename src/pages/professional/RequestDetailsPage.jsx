import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  doc, onSnapshot, getDoc, updateDoc, addDoc,
  collection, serverTimestamp, deleteField,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { showToast } from '../../components/common/Toast'
import { friendlyError } from '../../utils/errors'
import { VetBottomNav, ClientBottomNav } from '../../components/common/BottomNav'
import { format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { distanceKm, formatKm } from '../../utils/geo'
import { PetRecords } from '../client/PetsPage'
import { directChatId } from '../../services/directChat'
import useVetTracking from '../../hooks/useVetTracking'
import VetTrackingMap from '../../components/shared/VetTrackingMap'

/* ── Horizontal 4-step tracker ──────────────────────────────────
   1 Pendente → 2 Aceito → 3 Em Andamento → 4 Finalizado
──────────────────────────────────────────────────────────────── */
const H_STEPS = ['Pendente', 'Aceito', 'Em Andamento', 'Finalizado']

function hStepIndex(status) {
  const s = (status || '').toLowerCase()
  if (['finalizado', 'done', 'completed'].includes(s)) return 4
  if (['em_andamento', 'in_progress', 'pausado', 'paused'].includes(s)) return 3
  if (['aceito', 'accepted', 'a_caminho', 'confirmado'].includes(s)) return 2
  return 1 // pendente / pending
}

/* ── Status badge config ─────────────────────────────────────── */
function statusBadge(status) {
  const s = (status || '').toLowerCase()
  if (['finalizado', 'done'].includes(s))
    return { label: 'Finalizado', cls: 'bg-gray-200 text-gray-700' }
  if (['em_andamento', 'in_progress'].includes(s))
    return { label: 'Em Andamento', cls: 'bg-blue-500 text-white' }
  if (s === 'pausado')
    return { label: 'Pausado', cls: 'bg-orange-400 text-white' }
  if (['aceito', 'accepted', 'confirmado'].includes(s))
    return { label: 'Aceito', cls: 'bg-green-500 text-white' }
  if (s === 'a_caminho')
    return { label: 'A Caminho', cls: 'bg-blue-400 text-white' }
  if (s === 'rejeitado')
    return { label: 'Recusado', cls: 'bg-red-500 text-white' }
  return { label: 'Pendente', cls: 'bg-amber-400 text-white' }
}

function formatDateTime(ts) {
  if (!ts) return '—'
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
export default function RequestDetailsPage() {
  const { id } = useParams()
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
  const notesInitRef = useRef(false)

  // Vet GPS: ativo só quando status = a_caminho e o usuário é o profissional
  useVetTracking(id, !!(user?.uid && user.uid === req?.professionalId && req?.status === 'a_caminho'))

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

  const clientPhone = client?.phone || req?.clientContact || ''

  function shareWhatsApp() {
    const digits = clientPhone.replace(/\D/g, '')
    const number = digits ? `55${digits}` : ''
    const text = `Olá, ${req.clientName || 'cliente'}! Referente ao atendimento *${req.service}* pelo Avante:\n${window.location.href}`
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
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
    <div className="page-container">
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

  const status = (req.status || '').toLowerCase()
  const urgency = (req.urgency || '').toLowerCase()
  const currentHStep = hStepIndex(status)
  const isPending = currentHStep === 1
  const isFinished = currentHStep === 4
  const isRejected = status === 'rejeitado'
  const isProf = user?.uid === req.professionalId
  const isActiveStatus = currentHStep >= 2 && currentHStep < 4

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
      <div className="page-container">
        {/* ── Green Header ─────────────────────────────────── */}
        <div className="bg-primary px-4 pt-4 pb-6">
          {/* Topbar row */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
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

                      {/* Label — centred under the circle */}
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
                  label="Telefone" value={client.phone} href={`tel:${client.phone}`}
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

          {/* ── Ações Rápidas ─────────────────────────────────── */}
          {!isRejected && !isPending && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <p className="font-bold text-gray-800 text-sm">Ações Rápidas</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {isProf && (req.locationLabel || req.location) && (
                  <QuickBtn href={mapUrl}
                    icon="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    label="Abrir Rota" />
                )}
                {isProf && clientPhone && (
                  <QuickBtn href={`tel:${clientPhone}`}
                    icon="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    label="Ligar" />
                )}
                <QuickBtn
                  onClick={clientPhone ? shareWhatsApp : undefined}
                  disabled={!clientPhone}
                  icon="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"
                  label={clientPhone ? 'WhatsApp' : 'Sem celular cadastrado'}
                />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
               ACTION AREA
               Layout (matches mobile):
               1. Abrir Chat  — green filled, always first (except pending/rejected)
               2. Status-specific action buttons — all dark green
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

            {/* ── Abrir Chat — ALWAYS first (green filled) ─── */}
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

                {/* ACEITO → A Caminho */}
                {status === 'aceito' && (
                  <GreenBtn onClick={() => triggerStatus('a_caminho')} disabled={updating} loading={updating}
                    iconPath="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM3 8h14l-1 7H4L3 8z"
                    label="A Caminho" />
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

            {/* ── Finalizado: confirmation + rating flow ────── */}
            {isFinished && (
              <FinalizadoCard
                req={req}
                isClient={user?.uid === req.clientId}
                isProf={isProf}
                onClientConfirm={async () => {
                  await updateDoc(doc(db, 'requests', id), { confirmFinish_client: true }).catch(() => {})
                  if (req.appointmentId) {
                    await updateDoc(doc(db, 'appointments', req.appointmentId), { confirmFinish_client: true }).catch(() => {})
                  }
                }}
                onRate={() => navigate(`/rate/${id}`)}
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
      {req && (user?.uid === req.clientId ? <ClientBottomNav /> : <VetBottomNav />)}
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

function QuickBtn({ onClick, href, icon, label, disabled }) {
  const cls = `flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors w-full
    ${disabled
      ? 'bg-gray-50 opacity-50 cursor-not-allowed'
      : 'bg-gray-50 hover:bg-primary/5 cursor-pointer'}`
  const content = (
    <>
      <div className={`p-2 rounded-lg flex-shrink-0 ${disabled ? 'bg-gray-200' : 'bg-primary/10'}`}>
        <svg className={`w-4 h-4 ${disabled ? 'text-gray-400' : 'text-primary'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <span className={`text-sm font-semibold truncate ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>
        {label}
      </span>
    </>
  )
  if (href && !disabled) return <a href={href} target="_blank" rel="noreferrer" className={cls}>{content}</a>
  return <button onClick={!disabled ? onClick : undefined} disabled={disabled} className={cls}>{content}</button>
}

/* ── Reusable coloured action button ─────────────────────────── */
/* ── GreenBtn — unified dark-green action button ─────────────── */
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

/* ── FinalizadoCard — handles the full post-finish flow ──────────
   States:
   A) client NOT confirmed → orange "aguardando" + (client) confirm CTA / (prof) waiting note
   B) client confirmed, NOT rated → green "concluído" + (client) rate CTA
   C) rated → "avaliado" note
──────────────────────────────────────────────────────────────── */
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

      {/* Client confirm CTA — green & enabled */}
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
  const [open, setOpen] = useState(false)
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <div className="bg-primary/8 p-2 rounded-lg">
          <span className="text-lg">🐾</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-800 text-sm">{req.petName}</p>
          <p className="text-xs text-gray-400">{req.petSpecies || 'Animal'}</p>
        </div>
        <button onClick={() => setOpen(o => !o)}
          className="text-xs font-bold text-primary px-3 py-1.5 rounded-full hover:bg-primary/5 transition-colors">
          {open ? 'Fechar' : 'Prontuário'}
        </button>
      </div>
      {open && (
        <PetRecords
          ownerId={req.petOwnerId}
          petId={req.petId}
          canAdd={isProf}
          professionalId={isProf ? userUid : null}
          authorName={isProf ? (req.professionalName || 'Veterinário') : ''}
        />
      )}
    </div>
  )
}


function statusLabel(s) {
  const map = {
    aceito: 'Aceito', a_caminho: 'A Caminho', em_andamento: 'Em Andamento',
    pausado: 'Pausado', finalizado: 'Finalizado', rejeitado: 'Recusado',
  }
  return map[(s || '').toLowerCase()] || s
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
  pdf.text('Avante — Comprovante de Atendimento', 14, 19)

  y = 44
  pdf.setTextColor(40, 40, 40)
  pdf.setFontSize(11); pdf.setFont(undefined, 'normal')

  const when = req.requestedTimestamp?.toDate?.()
  const rows = [
    ['Serviço', req.service || 'Atendimento veterinário'],
    ['Profissional', req.professionalName || '—'],
    ['Cliente', req.clientName || '—'],
    ['Animal', req.petName ? `${req.petName} (${req.petSpecies || ''})` : '—'],
    ['Data do atendimento', when ? format(when, "dd/MM/yyyy 'às' HH:mm") : '—'],
    ['Local', req.location || '—'],
    ['Status', 'Finalizado'],
    ['Código', req.id || '—'],
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
  pdf.text(`Documento gerado pelo app Avante em ${format(new Date(), 'dd/MM/yyyy HH:mm')}.`, 14, y)
  pdf.text('Este comprovante não substitui receituário ou atestado veterinário.', 14, y + 5)

  pdf.save(`avante-atendimento-${(req.id || 'comprovante').slice(0, 8)}.pdf`)
}
