/**
 * ChatsListPage — todas as conversas do usuário (cliente ou vet),
 * em tempo real, ordenadas pela mensagem mais recente.
 * Inclui conversas diretas (antes da solicitação) e de atendimentos.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, deleteDoc, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { format, isToday, isYesterday } from 'date-fns'
import { VetBottomNav, ClientBottomNav } from '../../components/common/BottomNav'
import OffersBanner from '../../components/client/OffersBanner'

function timeLabel(ts) {
  const d = ts?.toDate?.()
  if (!d) return ''
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Ontem'
  return format(d, 'dd/MM')
}

export default function ChatsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid

  const [asClient, setAsClient] = useState(null)
  const [asProf, setAsProf] = useState(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    if (!uid) return
    getDoc(doc(db, 'users', uid)).then(snap => {
      const d = snap.data() || {}
      setIsClient(d.profession === 'client' || !d.profession)
    }).catch(() => {})
    const u1 = onSnapshot(
      query(collection(db, 'chats'), where('clientId', '==', uid)),
      snap => setAsClient(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setAsClient([])
    )
    const u2 = onSnapshot(
      query(collection(db, 'chats'), where('professionalId', '==', uid)),
      snap => setAsProf(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setAsProf([])
    )
    return () => { u1(); u2() }
  }, [uid])

  // Limpeza oportunista: apaga chats expirados (>7 dias) ao abrir a lista.
  // Substitui a função agendada (que exigiria plano Blaze).
  useEffect(() => {
    if (asClient === null || asProf === null) return
    const now = Date.now()
    const all = [...asClient, ...asProf]
    const expired = all.filter(c => {
      const exp = c.expiresAt?.toDate?.()?.getTime()
      return exp && exp <= now
    })
    expired.forEach(async c => {
      try {
        const msgs = await getDocs(collection(db, 'chats', c.id, 'messages'))
        if (!msgs.empty) {
          const batch = writeBatch(db)
          msgs.docs.forEach(m => batch.delete(m.ref))
          await batch.commit()
        }
        await deleteDoc(doc(db, 'chats', c.id))
      } catch {}
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asClient, asProf])

  const chats = useMemo(() => {
    if (asClient === null || asProf === null) return null
    // Dedup by chatId first, then by participant pair — keep most recently updated per pair
    const byId = new Map()
    for (const c of [...asClient, ...asProf]) byId.set(c.id, c)

    const byPair = new Map()
    for (const c of [...byId.values()]) {
      const pairKey = [c.clientId, c.professionalId].filter(Boolean).sort().join('_')
      if (!pairKey) continue
      const prev = byPair.get(pairKey)
      const cTime = c.updatedAt?.toDate?.()?.getTime() || 0
      const pTime = prev?.updatedAt?.toDate?.()?.getTime() || 0
      if (!prev || cTime > pTime) byPair.set(pairKey, c)
    }

    return [...byPair.values()].sort((a, b) =>
      (b.updatedAt?.toDate?.() || 0) - (a.updatedAt?.toDate?.() || 0)
    )
  }, [asClient, asProf])

  return (
    <div className="page-container">
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary" aria-label="Voltar">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="page-title">Conversas</h1>
        <div className="w-6" />
      </div>

      {chats === null ? (
        <div className="flex justify-center py-24"><Spinner size={32} color="#375337" /></div>
      ) : chats.length === 0 ? (
        <div className="flex flex-col items-center gap-3 text-gray-400 py-24 px-8 text-center">
          <svg className="w-14 h-14 opacity-25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-sm">Nenhuma conversa ainda</p>
        </div>
      ) : (
        <div className="px-4 py-3 flex flex-col gap-2 pb-nav stagger">
          <OffersBanner className="mb-1" audience={isClient ? 'client' : 'vet'} />
          {chats.map(c => {
            const iAmClient = c.clientId === uid
            const otherName = iAmClient ? (c.professionalName || 'Profissional') : (c.clientName || 'Cliente')
            const unread = c.lastMessage && c.lastMessageSenderId && c.lastMessageSenderId !== uid && c[`read_${uid}`] !== true
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/chat/${c.id}`)}
                className="card flex items-center gap-3 py-3 text-left hover:shadow-card-hover transition-all active:scale-[0.99]"
              >
                <div className="avatar-circle w-11 h-11 text-lg">{otherName[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                      {otherName}
                    </p>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{timeLabel(c.updatedAt)}</span>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${unread ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                    {c.lastMessage || (c.direct ? 'Conversa iniciada' : 'Atendimento')}
                  </p>
                </div>
                {unread && <span className="w-2.5 h-2.5 bg-primary rounded-full flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
      {isClient ? <ClientBottomNav /> : <VetBottomNav />}
    </div>
  )
}
