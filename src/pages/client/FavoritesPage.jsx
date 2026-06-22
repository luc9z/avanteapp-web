/**
 * FavoritesPage — veterinários favoritados pelo cliente.
 * O favorito agora é o PROFISSIONAL (não a solicitação): fica salvo
 * em users/{uid}.favorites e sincroniza em tempo real com o coração
 * dos cartões na busca.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  doc, onSnapshot, getDoc, updateDoc, arrayRemove, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { ClientBottomNav } from '../../components/common/BottomNav'
import ProfCard from '../../components/client/ProfCard'
import ScheduleSheet from '../../components/client/ScheduleSheet'
import Spinner from '../../components/common/Spinner'
import { showToast } from '../../components/common/Toast'
import { friendlyError } from '../../utils/errors'
import { openDirectChat } from '../../services/directChat'
import AdBanner from '../../components/common/AdBanner'

export default function FavoritesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid

  const [favIds, setFavIds] = useState(null)
  const [profs, setProfs] = useState([])
  const [scheduleProf, setScheduleProf] = useState(null)

  // Ids dos favoritos em tempo real
  useEffect(() => {
    if (!uid) return
    return onSnapshot(doc(db, 'users', uid), snap => {
      const favs = snap.data()?.favorites
      setFavIds(Array.isArray(favs) ? favs : [])
    }, () => setFavIds([]))
  }, [uid])

  // Carrega os perfis dos favoritados
  useEffect(() => {
    if (favIds === null) return
    if (favIds.length === 0) { setProfs([]); return }
    Promise.all(favIds.map(id =>
      getDoc(doc(db, 'users', id)).then(s => s.exists() ? { uid: id, ...s.data() } : null).catch(() => null)
    )).then(list => setProfs(list.filter(Boolean)))
  }, [favIds])

  async function removeFavorite(profId) {
    try {
      await updateDoc(doc(db, 'users', uid), {
        favorites: arrayRemove(profId),
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      showToast(friendlyError(e), 'error')
    }
  }

  async function handleMessage(prof) {
    try {
      const snap = await getDoc(doc(db, 'users', uid))
      const chatId = await openDirectChat(user, prof, snap.data()?.name)
      navigate(`/chat/${chatId}`)
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível abrir a conversa.'), 'error')
    }
  }

  return (
    <div className="page-container">
      <div className="topbar">
        <h1 className="text-lg font-bold text-primary">Favoritos</h1>
        {favIds?.length > 0 && (
          <span className="text-xs font-semibold text-gray-400">
            {favIds.length} veterinário{favIds.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="px-4 py-4 pb-nav">
        {favIds === null ? (
          <div className="flex justify-center py-24"><Spinner size={32} color="#375337" /></div>
        ) : profs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-gray-400 py-20 px-6 text-center animate-fade-up">
            <svg className="w-14 h-14 opacity-25" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <p className="text-sm font-medium">Nenhum favorito ainda</p>
            <p className="text-xs max-w-xs">
              Toque no coração de um veterinário na busca para encontrá-lo rapidamente aqui.
            </p>
            <button onClick={() => navigate('/home')} className="btn-primary px-6 mt-2">
              Buscar veterinários
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 stagger">
            <AdBanner audience="client" />
            <div className="responsive-grid-2">
            {profs.map(p => (
              <ProfCard
                key={p.uid}
                prof={p}
                isFavorite
                onToggleFavorite={() => removeFavorite(p.uid)}
                onView={() => navigate(`/professional/${p.uid}`)}
                onRequest={() => setScheduleProf(p)}
                onMessage={() => handleMessage(p)}
              />
            ))}
            </div>
          </div>
        )}
      </div>

      <ClientBottomNav />

      <ScheduleSheet
        open={!!scheduleProf}
        professional={scheduleProf}
        user={user}
        onClose={() => setScheduleProf(null)}
      />
    </div>
  )
}
