/**
 * directChat.js — conversa ÚNICA entre cliente ↔ veterinário.
 *
 * Antes existiam dois chats (um "direto" antes da solicitação e outro
 * por requestId). Agora é UM só thread por par cliente/vet, com id
 * determinístico (direct_cliente_vet). A solicitação apenas referencia
 * esse thread (campo chatId), então toda a conversa fica em um lugar.
 *
 * Os chats são TEMPORÁRIOS: expiram após 7 dias sem atividade
 * (expiresAt é renovado a cada abertura/mensagem).
 */
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'

export const CHAT_TTL_DAYS = 7

export function directChatId(clientId, professionalId) {
  return `direct_${clientId}_${professionalId}`
}

export function isDirectChat(chatId) {
  const id = chatId || ''
  return id.startsWith('direct_') || id.startsWith('dm_') // dm_ = formato antigo
}

/** Timestamp de expiração: agora + 7 dias. */
export function freshExpiry() {
  return Timestamp.fromDate(new Date(Date.now() + CHAT_TTL_DAYS * 24 * 60 * 60 * 1000))
}

/**
 * Garante que o thread existe e renova a expiração. Retorna o id.
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
    expiresAt: freshExpiry(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return id
}
