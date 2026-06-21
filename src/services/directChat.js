/**
 * directChat.js — conversa direta cliente ↔ veterinário, ANTES de
 * existir uma solicitação. O id é determinístico (direct_cliente_vet),
 * então abrir a conversa de novo sempre cai no mesmo chat.
 */
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

export function directChatId(clientId, professionalId) {
  return `direct_${clientId}_${professionalId}`
}

export function isDirectChat(chatId) {
  const id = chatId || ''
  return id.startsWith('direct_') || id.startsWith('dm_') // dm_ = formato antigo
}

/**
 * Garante que o documento do chat existe e retorna o id.
 * clientProfile: { name } — para o vet ver quem está falando.
 */
export async function openDirectChat(user, professional, clientName) {
  const id = directChatId(user.uid, professional.uid)
  await setDoc(doc(db, 'chats', id), {
    direct: true,
    participants: [user.uid, professional.uid],
    clientId: user.uid,
    professionalId: professional.uid,
    clientName: clientName || user.displayName || 'Cliente',
    professionalName: professional.name || 'Profissional',
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return id
}
