/**
 * useLocalNotifications — escuta, em tempo real, novos pedidos (para o vet)
 * e novas mensagens de chat (para ambos) e dispara notificações locais.
 *
 * Sem servidor: roda no cliente enquanto o app estiver aberto. Ignora o
 * primeiro snapshot (carga inicial) para não notificar histórico.
 */
import { useEffect, useRef } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { notify, notifPermission } from '../services/localNotify'

export default function useLocalNotifications(uid) {
  const seededReq = useRef(false)
  const seededChat = useRef(false)
  const lastMsgByChat = useRef({})

  useEffect(() => {
    if (!uid) return
    seededReq.current = false
    seededChat.current = false
    lastMsgByChat.current = {}

    // Novos pedidos para o veterinário
    const unsubReq = onSnapshot(
      query(collection(db, 'requests'), where('professionalId', '==', uid)),
      snap => {
        if (!seededReq.current) { seededReq.current = true; return }
        if (notifPermission() !== 'granted') return
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return
          const r = ch.doc.data()
          if ((r.status || '').toLowerCase() !== 'pendente') return
          notify(
            r.urgency === 'urgent' ? '🚨 Solicitação URGENTE' : 'Nova solicitação',
            `${r.clientName || 'Um cliente'} solicitou ${r.service || 'atendimento'}.`,
            `/request/${ch.doc.id}`
          )
        })
      },
      () => {}
    )

    // Novas mensagens nos chats em que participo
    const unsubChat = onSnapshot(
      query(collection(db, 'chats'), where('participants', 'array-contains', uid)),
      snap => {
        const seeded = seededChat.current
        snap.docs.forEach(d => {
          const c = d.data()
          const prev = lastMsgByChat.current[d.id]
          lastMsgByChat.current[d.id] = c.lastMessage || ''
          if (!seeded) return
          if (notifPermission() !== 'granted') return
          // Notifica só se a última mensagem mudou e foi o OUTRO que enviou
          if (c.lastMessage && c.lastMessage !== prev && c.lastMessageSenderId && c.lastMessageSenderId !== uid) {
            const name = c.clientId === uid ? (c.professionalName || 'Mensagem') : (c.clientName || 'Mensagem')
            notify(name, c.lastMessage, `/chat/${d.id}`)
          }
        })
        seededChat.current = true
      },
      () => {}
    )

    return () => { unsubReq(); unsubChat() }
  }, [uid])
}
