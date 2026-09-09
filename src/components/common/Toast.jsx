/**
 * Toast - o único canal de aviso do app.
 *
 * Erros nunca aparecem em `alert()`: entram aqui com ícone, cor e o
 * tempo de leitura maior (uma mensagem de erro costuma ser mais longa
 * e a pessoa precisa conseguir lê-la antes de sumir).
 *
 * Os toasts empilham de baixo para cima e podem ser dispensados no
 * toque. O posicionamento é do container - cada toast é estático
 * dentro dele, senão vários toasts se sobrepõem no mesmo ponto.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

let _showToast = null

/** Quanto tempo cada tipo fica na tela. Erro pede mais leitura. */
const DURACAO = { error: 6000, success: 3000, info: 4000, warning: 5000 }

/**
 * @param {string} message  texto exibido
 * @param {'info'|'success'|'error'|'warning'} type
 * @param {{ duration?: number, action?: { label: string, onClick: () => void } }} [opts]
 */
export function showToast(message, type = 'info', opts) {
  _showToast?.(message, type, opts)
}

const ICONS = {
  success: 'M4.5 12.75l6 6 9-13.5',
  error: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
  warning: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
  info: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])
  // Guarda os timers para conseguir cancelar quando o toast é fechado
  // no toque - sem isso o timer removeria um id que já não existe.
  const timers = useRef(new Map())

  const dismiss = useCallback(id => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, saindo: true } : t)))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 200)
  }, [])

  useEffect(() => {
    let seq = 0
    _showToast = (message, type, opts) => {
      const id = `${Date.now()}-${seq++}`
      setToasts(prev => [...prev.slice(-3), { id, message, type, action: opts?.action }])
      const ms = opts?.duration ?? DURACAO[type] ?? DURACAO.info
      timers.current.set(id, setTimeout(() => dismiss(id), ms))
    }
    return () => {
      _showToast = null
      for (const t of timers.current.values()) clearTimeout(t)
      timers.current.clear()
    }
  }, [dismiss])

  if (toasts.length === 0) return null

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type} ${t.saindo ? 'toast-out' : ''}`}>
          <svg className="toast-icon" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[t.type] || ICONS.info} />
          </svg>
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              onClick={() => { t.action.onClick(); dismiss(t.id) }}
              className="toast-action"
            >
              {t.action.label}
            </button>
          )}
          <button onClick={() => dismiss(t.id)} className="toast-close" aria-label="Fechar aviso">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
