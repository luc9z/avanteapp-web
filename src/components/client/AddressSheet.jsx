import { useEffect, useState } from 'react'
import Spinner from '../common/Spinner'
import MapPicker from './MapPicker'
import { showToast } from '../common/Toast'

/* ── AddressSheet — bottom sheet para criar/editar uma propriedade ──
   Propriedade = { id, label, address, lat, lng }
   GPS é opcional mas recomendado (pin exato no mapa para o vet).
──────────────────────────────────────────────────────────────────── */
export default function AddressSheet({ open, onClose, onSave, initial }) {
  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState(null)
  const [capturing, setCapturing] = useState(false)
  const [showMap, setShowMap] = useState(false)

  useEffect(() => {
    if (open) {
      setLabel(initial?.label || '')
      setAddress(initial?.address || '')
      setCoords(initial?.lat != null ? { lat: initial.lat, lng: initial.lng } : null)
    }
  }, [open, initial])

  function translateGpsError(err) {
    if (err.code === 1) return 'Permissão de localização negada. Habilite o GPS nas configurações.'
    if (err.code === 2) return 'Localização indisponível. Verifique se o GPS está ativado.'
    if (err.code === 3) return 'Tempo esgotado ao obter localização. Tente novamente.'
    return 'Não foi possível obter a localização.'
  }

  function captureGps() {
    if (!navigator.geolocation) return showToast('GPS não suportado neste dispositivo', 'error')
    setCapturing(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setCapturing(false)
        setShowMap(true) // abre o mapa para ajuste fino do pin
        const accuracy = Math.round(pos.coords.accuracy || 0)
        showToast(
          accuracy > 50
            ? `GPS capturado (precisão ~${accuracy}m). Ajuste o pin no mapa.`
            : 'Localização capturada! Confira o pin no mapa.',
          'success'
        )
      },
      err => { setCapturing(false); showToast(translateGpsError(err), 'error') },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function handleSave() {
    if (!label.trim()) return showToast('Dê um nome à propriedade (ex: Fazenda Boa Vista)', 'error')
    if (!address.trim() && !coords) return showToast('Informe o endereço ou capture a localização', 'error')
    onSave({
      id: initial?.id || `prop_${Date.now()}`,
      label: label.trim(),
      address: address.trim(),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    })
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full sm:max-w-md sm:mx-auto max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2.5 rounded-xl">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <p className="font-bold text-gray-900 text-base">
              {initial ? 'Editar propriedade' : 'Nova propriedade'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 flex flex-col gap-4 pb-6">
          {/* Nome */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Nome da propriedade</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Ex: Fazenda Boa Vista"
              className="input-field"
            />
          </div>

          {/* Endereço */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Endereço / referência</label>
            <textarea
              value={address}
              onChange={e => setAddress(e.target.value)}
              rows={2}
              placeholder="Estrada X, km 12 — porteira azul, após o posto"
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm outline-none
                         focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-colors"
            />
          </div>

          {/* GPS + ajuste no mapa */}
          {(showMap || coords) && (
            <MapPicker
              lat={coords?.lat}
              lng={coords?.lng}
              onChange={({ lat, lng }) => setCoords({ lat, lng })}
            />
          )}

          {coords ? (
            <button
              type="button"
              onClick={captureGps}
              className="flex items-center gap-3 p-3.5 bg-green-50 border border-green-200 rounded-2xl text-left"
            >
              <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-900">Pin marcado no mapa ✓</p>
                <p className="text-xs text-green-600">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)} · toque para recapturar o GPS</p>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={captureGps}
              disabled={capturing}
              className="flex items-center gap-3 p-3.5 bg-gray-50 border border-gray-200 rounded-2xl hover:border-primary/50 transition-colors text-left"
            >
              {capturing ? <Spinner size={20} color="#375337" /> : (
                <svg className="w-5 h-5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-700">Capturar GPS no local</p>
                <p className="text-xs text-gray-400">Depois você ajusta o pin no mapa, se precisar</p>
              </div>
            </button>
          )}

          {!coords && !showMap && (
            <button
              type="button"
              onClick={() => setShowMap(true)}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed
                         border-gray-300 text-gray-500 font-semibold text-sm hover:border-primary/50
                         hover:text-primary transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              Marcar direto no mapa (sem GPS)
            </button>
          )}

          <button onClick={handleSave} className="btn-primary w-full py-3.5 mt-1">
            Salvar propriedade
          </button>
        </div>
      </div>
    </div>
  )
}
