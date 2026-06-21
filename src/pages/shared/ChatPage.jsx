/**
 * ChatPage — Chat em tempo real entre cliente e veterinário.
 * Rota: /chat/:requestId
 *
 * Firestore:
 *   chats/{requestId}/messages/{msgId}
 *     senderId, senderName, senderRole, content, type ('text'|'location'), lat?, lng?, createdAt
 *   chats/{requestId}
 *     participants, clientName, professionalName, lastMessage, updatedAt
 *
 * Bugs corrigidos:
 *   - Usava getDoc (one-shot) para o request → race condition quando
 *     as mensagens chegavam antes do documento. Substituído por onSnapshot
 *     para que o status seja reativo e o chat se desbloqueie automaticamente
 *     quando o profissional aceitar.
 */
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  collection, doc, addDoc, onSnapshot, getDoc,
  setDoc, serverTimestamp, query, orderBy, updateDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { showToast } from '../../components/common/Toast'
import { friendlyError } from '../../utils/errors'

import { isDirectChat } from '../../services/directChat'
import { format, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const CHAT_ALLOWED_STATUSES = [
  'aceito', 'accepted', 'a_caminho', 'chegou_local',
  'em_andamento', 'in_progress', 'pausado', 'paused',
  'finalizado', 'done', 'completed',
]

function formatMsgTime(ts) {
  if (!ts) return ''
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return `Ontem ${format(d, 'HH:mm')}`
  return format(d, 'dd/MM HH:mm', { locale: ptBR })
}

function dateGroupLabel(d) {
  if (isToday(d)) return 'Hoje'
  if (isYesterday(d)) return 'Ontem'
  return format(d, "dd 'de' MMMM", { locale: ptBR })
}

/* ── Main ─────────────────────────────────────────────────────── */
export default function ChatPage() {
  const { requestId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [request, setRequest] = useState(null)
  const [requestLoading, setRequestLoading] = useState(true)
  const [chatReady, setChatReady] = useState(false)  // separate flag for request doc
  const [messages, setMessages] = useState([])
  const [messagesLoading, setMessagesLoading] = useState(true) // separate flag for messages
  const [myRole, setMyRole] = useState(null)

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [gettingLoc, setGettingLoc] = useState(false)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  /* ── 1. Subscribe to REQUEST (real-time, not one-shot) ──────────
     This fixes the race condition: if messages arrive before the
     request doc, the chat stays in "loading" state until BOTH are
     ready. It also makes the chat auto-unlock when the professional
     accepts — no page refresh needed.
  ─────────────────────────────────────────────────────────────── */
  const direct = isDirectChat(requestId)

  useEffect(() => {
    if (!requestId || !user?.uid) return

    // Conversa direta (antes de existir solicitação): a fonte de
    // verdade é o próprio documento do chat, não um request.
    const sourceRef = direct ? doc(db, 'chats', requestId) : doc(db, 'requests', requestId)

    const unsub = onSnapshot(
      sourceRef,
      snap => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() }
          setRequest(data)

          const role = data.clientId === user.uid ? 'client'
            : data.professionalId === user.uid ? 'professional'
            : null
          setMyRole(role)

          if (direct) setChatReady(true)
          else ensureChatDoc(snap.id, data)
        }
        setRequestLoading(false)
      },
      () => setRequestLoading(false)
    )
    return unsub
  }, [requestId, user?.uid, direct])

  async function ensureChatDoc(id, req) {
    try {
      const chatRef = doc(db, 'chats', id)
      const snap = await getDoc(chatRef)
      if (snap.exists()) {
        // Migração: chats antigos podem não ter clientId/professionalId,
        // e as regras de segurança dependem deles. Completa os campos.
        const d = snap.data() || {}
        if (!d.clientId || !d.professionalId) {
          await setDoc(chatRef, {
            clientId: req.clientId,
            professionalId: req.professionalId,
            participants: [req.clientId, req.professionalId].filter(Boolean),
          }, { merge: true }).catch(() => {})
        }
        setChatReady(true)
        return
      }
      if (!snap.exists()) {
        await setDoc(chatRef, {
          requestId: id,
          participants: [req.clientId, req.professionalId].filter(Boolean),
          clientId: req.clientId,
          professionalId: req.professionalId,
          clientName: req.clientName || 'Cliente',
          professionalName: req.professionalName || 'Profissional',
          lastMessage: '',
          updatedAt: serverTimestamp(),
        })
      }
      setChatReady(true)
    } catch (_) {}
  }

  /* ── 2. Subscribe to MESSAGES ──────────────────────────────── */
  useEffect(() => {
    if (!requestId || !chatReady) return
    const q = query(
      collection(db, 'chats', requestId, 'messages'),
      orderBy('createdAt', 'asc')
    )
    const unsub = onSnapshot(
      q,
      snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setMessagesLoading(false)
      },
      () => setMessagesLoading(false)
    )
    return unsub
  }, [requestId, chatReady])

  /* ── 3. Auto-scroll to bottom ──────────────────────────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ── 4. Send text message ──────────────────────────────────── */
  async function sendMessage(e) {
    e.preventDefault()
    const content = text.trim().slice(0, 1000) // limite de tamanho (custo + abuso)
    if (!content || sending) return
    setSending(true)
    setText('')
    try {
      const senderName = getSenderName()
      await addDoc(collection(db, 'chats', requestId, 'messages'), {
        senderId: user.uid,
        senderName,
        senderRole: myRole,
        content,
        type: 'text',
        createdAt: serverTimestamp(),
      })
      await updateDoc(doc(db, 'chats', requestId), {
        lastMessage: content,
        lastMessageSenderId: user.uid,
        updatedAt: serverTimestamp(),
      }).catch(() => {})
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível enviar a mensagem.'), 'error')
      setText(content)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  /* ── 5. Send location ──────────────────────────────────────── */
  async function sendLocation() {
    if (!navigator.geolocation) {
      return showToast('GPS não suportado neste dispositivo', 'error')
    }

    // Check permission state before requesting to show better UX
    if (navigator.permissions) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' })
        if (perm.state === 'denied') {
          return showToast('Permissão de localização negada. Habilite nas configurações do navegador.', 'error')
        }
      } catch {}
    }

    setGettingLoc(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const mapsUrl = `https://maps.google.com/maps?q=${lat},${lng}`
        const senderName = getSenderName()
        try {
          await addDoc(collection(db, 'chats', requestId, 'messages'), {
            senderId: user.uid,
            senderName,
            senderRole: myRole,
            content: mapsUrl,
            type: 'location',
            lat,
            lng,
            createdAt: serverTimestamp(),
          })
          await updateDoc(doc(db, 'chats', requestId), {
            lastMessage: '📍 Localização',
            lastMessageSenderId: user.uid,
            updatedAt: serverTimestamp(),
          }).catch(() => {})
        } catch (e) {
          showToast(friendlyError(e, 'Não foi possível enviar a localização.'), 'error')
        } finally {
          setGettingLoc(false)
        }
      },
      err => {
        setGettingLoc(false)
        const msgs = {
          1: 'Permissão de localização negada. Habilite nas configurações do navegador.',
          2: 'Localização indisponível. Verifique se o GPS está ativado.',
          3: 'Tempo esgotado. Tente novamente.',
        }
        showToast(msgs[err.code] || 'Erro ao obter localização', 'error')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function getSenderName() {
    if (myRole === 'client') {
      return request?.clientName || user.displayName || 'Cliente'
    }
    return request?.professionalName || user.displayName || 'Profissional'
  }

  /* ── Derived state ─────────────────────────────────────────── */
  // true when request finished loading but doc doesn't exist (error / not found)
  const unavailable = !requestLoading && !request
  const isLoading = !unavailable && (requestLoading || messagesLoading)

  // Only evaluate statusOk when request is loaded (prevents false "locked" flash)
  const statusOk = !requestLoading && request
    ? (direct || CHAT_ALLOWED_STATUSES.includes((request.status || '').toLowerCase()))
    : null // null = still loading

  const otherName = myRole === 'client'
    ? (request?.professionalName || 'Profissional')
    : (request?.clientName || 'Cliente')

  /* ── Group messages by date ────────────────────────────────── */
  const grouped = messages.reduce((acc, msg) => {
    const ts = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date()
    const key = format(ts, 'yyyy-MM-dd')
    if (!acc[key]) acc[key] = { label: dateGroupLabel(ts), msgs: [] }
    acc[key].msgs.push(msg)
    return acc
  }, {})

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="page-container flex flex-col h-screen">

      {/* ── Topbar ─────────────────────────────────────────────── */}
      <div className="topbar flex-shrink-0 shadow-sm">
        <button onClick={() => navigate(-1)} className="text-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex flex-col items-center">
          <span className="font-bold text-primary text-sm leading-tight">
            {requestLoading ? '…' : otherName}
          </span>
          <span className="text-xs text-gray-400">
            {requestLoading ? '' : direct ? 'Conversa' : (request?.service || 'Atendimento')}
          </span>
        </div>

        {direct ? <div className="w-5" /> : (
          <button
            onClick={() => navigate(`/request/${requestId}`)}
            className="text-primary hover:text-primary-600"
            title="Ver detalhes"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Messages area ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 bg-gray-50">
        {unavailable && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 py-20 text-center px-6">
            <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-semibold text-gray-500">Não foi possível abrir esta conversa</p>
            <p className="text-xs max-w-xs">
              Verifique sua conexão. Se o problema continuar, as regras de segurança
              do banco podem estar desatualizadas (firestore.rules precisa ser publicado).
            </p>
            <button onClick={() => window.location.reload()} className="btn-outline px-5 py-2 text-xs mt-1">
              Tentar de novo
            </button>
          </div>
        )}

        {/* Loading spinner (waits for BOTH request + messages) */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <Spinner size={28} color="#375337" />
          </div>
        )}

        {/* Locked: request loaded but status not allowed */}
        {!isLoading && statusOk === false && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 py-20">
            <svg className="w-14 h-14 opacity-25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-sm text-center max-w-xs">
              O chat é liberado após o profissional aceitar a solicitação.
            </p>
          </div>
        )}

        {/* Unlocked: show messages */}
        {!isLoading && statusOk === true && (
          <>
            {Object.entries(grouped).map(([key, { label, msgs }]) => (
              <div key={key}>
                {/* Date divider */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-medium px-2 bg-gray-50">{label}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                {msgs.map((msg, i) => {
                  const isMine = msg.senderId === user.uid
                  const showName = !isMine && (i === 0 || msgs[i - 1]?.senderId !== msg.senderId)

                  return (
                    <div key={msg.id} className={`flex mb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        {showName && (
                          <span className="text-[11px] text-gray-400 font-medium mb-0.5 ml-1">
                            {msg.senderName}
                          </span>
                        )}

                        {/* Text bubble */}
                        {msg.type !== 'location' && (
                          <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                            isMine
                              ? 'bg-primary text-white rounded-br-sm'
                              : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
                          }`}>
                            {msg.content}
                          </div>
                        )}

                        {/* Location bubble */}
                        {msg.type === 'location' && (
                          <a
                            href={`https://maps.google.com/maps?q=${msg.lat},${msg.lng}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-sm border
                                        hover:opacity-90 transition-opacity max-w-[220px] ${
                              isMine
                                ? 'bg-primary border-primary/30 rounded-br-sm'
                                : 'bg-white border-gray-100 rounded-bl-sm'
                            }`}
                          >
                            {/* Map preview icon */}
                            <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${
                              isMine ? 'bg-white/20' : 'bg-primary/10'
                            }`}>
                              <svg className={`w-5 h-5 ${isMine ? 'text-white' : 'text-primary'}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </div>
                            <div>
                              <p className={`text-sm font-bold ${isMine ? 'text-white' : 'text-primary'}`}>
                                📍 Localização
                              </p>
                              <p className={`text-[11px] ${isMine ? 'text-white/70' : 'text-gray-400'}`}>
                                Toque para ver no mapa
                              </p>
                            </div>
                          </a>
                        )}

                        <span className="text-[10px] text-gray-300 mt-0.5 mx-1">
                          {formatMsgTime(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

            {/* Empty state */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 py-20">
                <svg className="w-14 h-14 opacity-25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-sm font-medium">Inicie a conversa!</p>
                <p className="text-xs text-center max-w-xs">
                  Use o ícone 📍 para enviar sua localização diretamente pelo chat.
                </p>
              </div>
            )}
          </>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ───────────────────────────────────────────── */}
      {!isLoading && statusOk === true && (
        <form
          onSubmit={sendMessage}
          className="flex-shrink-0 flex items-center gap-2 px-3 py-3
                     bg-white border-t border-gray-100"
        >
          {/* Location button */}
          <button
            type="button"
            onClick={sendLocation}
            disabled={gettingLoc || sending}
            title="Enviar localização"
            className="w-10 h-10 flex items-center justify-center rounded-full
                       bg-gray-100 hover:bg-primary/10 text-gray-500 hover:text-primary
                       transition-colors disabled:opacity-40 flex-shrink-0"
          >
            {gettingLoc ? <Spinner size={16} /> : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Escreva uma mensagem..."
            maxLength={1000}
            className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm outline-none
                       focus:ring-2 focus:ring-primary/20 focus:bg-white transition-colors"
            autoComplete="off"
          />

          {/* Send button */}
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="w-10 h-10 bg-primary rounded-full flex items-center justify-center
                       disabled:opacity-40 transition-opacity active:scale-95 flex-shrink-0"
          >
            {sending ? <Spinner size={16} color="white" /> : (
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </form>
      )}
    </div>
  )
}
