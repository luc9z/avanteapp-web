import { useEffect, useState } from 'react'

let _showToast = null

export function showToast(message, type = 'info') {
  _showToast?.(message, type)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    _showToast = (message, type) => {
      const id = Date.now()
      setToasts(prev => [...prev, { id, message, type }])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 3500)
    }
    return () => { _showToast = null }
  }, [])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
