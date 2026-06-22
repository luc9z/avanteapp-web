import { useEffect, useRef } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const WRITE_INTERVAL_MS = 5000

export default function useVetTracking(requestId, active) {
  const watchIdRef = useRef(null)
  const lastWriteRef = useRef(0)

  useEffect(() => {
    if (!active || !requestId || !('geolocation' in navigator)) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      return
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const now = Date.now()
        if (now - lastWriteRef.current < WRITE_INTERVAL_MS) return
        lastWriteRef.current = now
        updateDoc(doc(db, 'requests', requestId), {
          vetLocation: {
            lat: coords.latitude,
            lng: coords.longitude,
            updatedAt: serverTimestamp(),
          },
        }).catch(() => {})
      },
      (err) => { if (import.meta.env.DEV) console.warn('GPS:', err.message) },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    )

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [active, requestId])
}
