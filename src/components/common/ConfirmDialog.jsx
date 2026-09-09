/**
 * ConfirmDialog - confirmação com a cara do app.
 *
 * Substitui `window.confirm()`, que ignora o tema, não permite
 * destacar o risco e no celular aparece como um alerta do navegador
 * (que muita gente confunde com propaganda e fecha no automático).
 *
 * Uso:
 *   const ok = await confirmDialog({ title, message, danger: true })
 *
 * Para ações sem volta, `confirmText` exige digitar a palavra: um
 * toque acidental não apaga uma conta inteira.
 */
import { useEffect, useRef, useState } from 'react'

let _abrir = null

/**
 * @param {{
 *   title: string,
 *   message?: string,
 *   details?: string[],
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   danger?: boolean,
 *   confirmText?: string,
 * }} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog(opts) {
  if (!_abrir) return Promise.resolve(false)
  return new Promise(resolve => _abrir(opts, resolve))
}

export function ConfirmHost() {
  const [estado, setEstado] = useState(null)   // { opts, resolve }
  const [texto, setTexto] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    _abrir = (opts, resolve) => { setTexto(''); setEstado({ opts, resolve }) }
    return () => { _abrir = null }
  }, [])

  // Trava o scroll do fundo e responde ao Esc, como um diálogo nativo.
  useEffect(() => {
    if (!estado) return
    document.body.style.overflow = 'hidden'
    const onKey = e => { if (e.key === 'Escape') responder(false) }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => inputRef.current?.focus(), 80)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [estado])

  function responder(ok) {
    estado?.resolve(ok)
    setEstado(null)
    setTexto('')
  }

  if (!estado) return null
  const o = estado.opts
  const exigido = o.confirmText || ''
  const liberado = !exigido || texto.trim().toUpperCase() === exigido.toUpperCase()

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) responder(false) }}>
      <div className="modal-box animate-scale-in" role="alertdialog" aria-modal="true">
        <div className="flex gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
            o.danger ? 'bg-red-50 text-red-500' : 'bg-primary/10 text-primary'
          }`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d={o.danger
                  ? 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z'
                  : 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0z'} />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900 leading-snug">{o.title}</h3>
            {o.message && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{o.message}</p>}
          </div>
        </div>

        {Array.isArray(o.details) && o.details.length > 0 && (
          <ul className="mt-3 bg-gray-50 rounded-2xl px-4 py-3 flex flex-col gap-1.5">
            {o.details.map((d, i) => (
              <li key={i} className="text-xs text-gray-600 flex gap-2">
                <span className="text-gray-300 flex-shrink-0">•</span>
                <span className="flex-1">{d}</span>
              </li>
            ))}
          </ul>
        )}

        {exigido && (
          <div className="mt-3">
            <label className="field-label">
              Digite <b className="text-red-600">{exigido}</b> para confirmar
            </label>
            <input
              ref={inputRef}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && liberado) responder(true) }}
              className="input-field"
              placeholder={exigido}
              autoCapitalize="characters"
            />
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button onClick={() => responder(false)} className="btn-outline flex-1">
            {o.cancelLabel || 'Cancelar'}
          </button>
          <button
            onClick={() => responder(true)}
            disabled={!liberado}
            className={`${o.danger ? 'btn-danger-solid' : 'btn-primary'} flex-1`}
          >
            {o.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
