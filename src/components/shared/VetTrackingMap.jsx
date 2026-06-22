import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { distanceKm, formatKm } from '../../utils/geo'

const vetIcon = L.divIcon({
  className: '',
  html: `<div style="background:#375337;color:white;width:38px;height:38px;border-radius:50%;
                      display:flex;align-items:center;justify-content:center;font-size:20px;
                      box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white;">🚗</div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
})

const clientIcon = L.divIcon({
  className: '',
  html: `<svg width="32" height="40" viewBox="0 0 24 30" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))">
           <path fill="#e55" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
           <circle cx="12" cy="9" r="3" fill="white"/>
         </svg>`,
  iconSize: [32, 40],
  iconAnchor: [16, 40],
})

const DEFAULT_CENTER = [-15.78, -47.93]

export default function VetTrackingMap({ vetLocation, clientLat, clientLng }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const vetMarkerRef = useRef(null)

  const vLat = vetLocation?.lat
  const vLng = vetLocation?.lng

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const center = vLat != null ? [vLat, vLng]
      : clientLat != null ? [clientLat, clientLng]
      : DEFAULT_CENTER

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView(center, 14)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)

    if (clientLat != null) {
      L.marker([clientLat, clientLng], { icon: clientIcon }).addTo(map).bindPopup('Você')
    }

    if (vLat != null) {
      vetMarkerRef.current = L.marker([vLat, vLng], { icon: vetIcon })
        .addTo(map).bindPopup('Veterinário')
      if (clientLat != null) {
        map.fitBounds([[vLat, vLng], [clientLat, clientLng]], { padding: [40, 40] })
      }
    }

    setTimeout(() => map.invalidateSize(), 200)
    mapRef.current = map

    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mapRef.current || vLat == null) return
    if (!vetMarkerRef.current) {
      vetMarkerRef.current = L.marker([vLat, vLng], { icon: vetIcon })
        .addTo(mapRef.current).bindPopup('Veterinário')
    } else {
      vetMarkerRef.current.setLatLng([vLat, vLng])
    }
    mapRef.current.panTo([vLat, vLng], { animate: true, duration: 0.8 })
  }, [vLat, vLng])

  const dist = formatKm(distanceKm(vLat, vLng, clientLat, clientLng))

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center gap-2.5 px-4 py-3 bg-blue-50 border-b border-blue-100">
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
        </span>
        <p className="text-sm font-bold text-blue-700">Veterinário a caminho</p>
        {dist && (
          <p className="ml-auto text-xs font-semibold text-blue-500">{dist} de distância</p>
        )}
      </div>

      <div ref={containerRef} style={{ height: 220 }} />

      {!vLat && (
        <p className="text-xs text-gray-400 text-center px-4 py-2">
          Aguardando localização do veterinário...
        </p>
      )}
    </div>
  )
}
