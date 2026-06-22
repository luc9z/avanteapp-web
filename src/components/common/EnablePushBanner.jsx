/**
 * EnablePushBanner — convite para ativar notificações.
 * Usa a Notification API do navegador (sem servidor/Blaze): funciona
 * enquanto o app está aberto. Aparece se o navegador suporta e a
 * permissão ainda não foi decidida. Some após ativar/recusar.
 */
import { useState } from 'react'
import { requestNotifPermission, notifSupported, notifPermission } from '../../services/localNotify'
import { showToast } from './Toast'

export default function EnablePushBanner({ uid, message }) {
  const [gone, setGone] = useState(false)
  const [busy, setBusy] = useState(false)

  if (gone || !notifSupported() || notifPermission() !== 'default') return null

  async function activate() {
    setBusy(true)
    const ok = await requestNotifPermission()
    setBusy(false)
    setGone(true)
    showToast(ok ? 'Notificações ativadas! 🔔' : 'Não foi possível ativar as notificações.', ok ? 'success' : 'error')
  }

  return (
    <div className="flex items-center gap-3 bg-primary/5 border border-primary/15 rounded-2xl px-3.5 py-3 animate-fade-up">
      <span className="text-xl">🔔</span>
      <p className="flex-1 text-xs text-gray-600 leading-relaxed">{message}</p>
      <button onClick={activate} disabled={busy}
        className="bg-primary text-white text-xs font-bold px-3.5 py-2 rounded-full flex-shrink-0
                   hover:bg-primary-600 transition-colors active:scale-95">
        {busy ? '...' : 'Ativar'}
      </button>
      <button onClick={() => setGone(true)} aria-label="Dispensar"
        className="text-gray-300 hover:text-gray-500 p-1 flex-shrink-0">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
