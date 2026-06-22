/**
 * localNotify.js — notificações no navegador SEM servidor (sem FCM/Blaze).
 *
 * Funciona enquanto houver uma aba do app aberta (mesmo em segundo plano):
 * os listeners em tempo real do Firestore detectam novos pedidos/mensagens
 * e disparam uma Notification nativa. Não cobre app totalmente fechado
 * (isso exigiria push real via Cloud Function).
 */

export function notifSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notifPermission() {
  return notifSupported() ? Notification.permission : 'denied'
}

export async function requestNotifPermission() {
  if (!notifSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const p = await Notification.requestPermission()
  return p === 'granted'
}

/** Dispara uma notificação local. Clicar abre/foca o app na URL dada. */
export function notify(title, body, url = '/') {
  if (!notifSupported() || Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: url, // colapsa notificações repetidas do mesmo destino
    })
    n.onclick = () => {
      window.focus()
      if (url && location.pathname !== url) location.href = url
      n.close()
    }
  } catch {}
}
