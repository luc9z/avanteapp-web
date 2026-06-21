/**
 * push.js — Notificações push (Firebase Cloud Messaging).
 *
 * Tokens ficam em users/{uid}/private/push (legível só pelo dono;
 * a Cloud Function lê via Admin SDK, que ignora as rules).
 *
 * Requer a VAPID key do projeto:
 *   Console Firebase → Configurações → Cloud Messaging →
 *   "Certificados push da Web" → gerar par de chaves →
 *   colar em VITE_FIREBASE_VAPID_KEY no .env.local
 * Sem a chave, tudo aqui vira no-op silencioso (o app funciona normal).
 */
import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import { doc, setDoc, arrayUnion, serverTimestamp } from 'firebase/firestore'
import app, { db } from '../firebase'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

export function pushAvailable() {
  return Boolean(VAPID_KEY) && 'Notification' in window && 'serviceWorker' in navigator
}

export function pushPermission() {
  return 'Notification' in window ? Notification.permission : 'denied'
}

/** Pede permissão, registra o SW e salva o token. Retorna true se ativou. */
export async function enablePush(uid) {
  try {
    if (!pushAvailable() || !uid) return false
    if (!(await isSupported())) return false

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    const messaging = getMessaging(app)
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    })
    if (!token) return false

    await setDoc(doc(db, 'users', uid, 'private', 'push'), {
      tokens: arrayUnion(token),
      updatedAt: serverTimestamp(),
    }, { merge: true })
    return true
  } catch (e) {
    if (import.meta.env.DEV) console.error('enablePush:', e)
    return false
  }
}
