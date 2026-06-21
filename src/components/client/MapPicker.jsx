/**
 * MapPicker — mapa com pin arrastável para marcar o local EXATO.
 * Resolve o problema do GPS impreciso: o usuário captura a posição
 * aproximada (ou parte do centro da região) e ajusta o pin com o
 * dedo até a porteira/casa certa.
 *
 * Leaflet + OpenStreetMap: gratuito, sem chave de API.
 */
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Pin customizado em SVG (evita o problema clássico dos ícones do
// Leaflet sumirem com bundlers como o Vite)
const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="36" height="36" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35))">
    <path fill="#375337" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    <circle cx="12" cy="9" r="3" fill="white"/>
  </svg>`,
  iconSize: [36, 36],
  iconAnchor: [18, 34],
})

// Centro padrão quando não há GPS: região central do RS
const DEFAULT_CENTER = [-29.19, -54.87]

export default function MapPicker({ lat, lng, onChange, height = 230 }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const hasCoords = lat != null && lng != null
    const center = hasCoords ? [lat, lng] : DEFAULT_CENTER

    const map = L.map(containerRef.current, {
      center,
      zoom: hasCoords ? 16 : 7,
      zoomControl: true,
      attributionControl: false,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map)

    const marker = L.marker(center, { icon: pinIcon, draggable: true }).addTo(map)

    marker.on('dragend', () => {
      const p = marker.getLatLng()
      onChange({ lat: p.lat, lng: p.lng })
    })

    // Tocar no mapa também move o pin
    map.on('click', (e) => {
      marker.setLatLng(e.latlng)
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng })
    })

    mapRef.current = map
    markerRef.current = marker

    // O contêiner nasce dentro de um bottom sheet animado;
    // recalcula o tamanho depois que o layout estabiliza
    setTimeout(() => map.invalidateSize(), 250)

    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Coordenadas mudaram por fora (ex.: botão "usar meu GPS")
  useEffect(() => {
    if (!mapRef.current || lat == null || lng == null) return
    markerRef.current?.setLatLng([lat, lng])
    mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 16))
  }, [lat, lng])

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 relative z-0" style={{ height }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white/95 text-gray-600 text-[10px]
                      font-semibold px-3 py-1 rounded-full shadow-sm pointer-events-none z-[500]">
        Arraste o pin ou toque no local exato
      </div>
    </div>
  )
}
