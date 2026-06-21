import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import Stars from '../../components/common/Stars'
import { VetBottomNav } from '../../components/common/BottomNav'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function firstName(raw) {
  if (!raw) return 'Cliente'
  const clean = raw.includes('@') ? raw.split('@')[0] : raw
  return clean.split(' ')[0]
}

export default function ViewRatingsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lastDoc, setLastDoc] = useState(null)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    if (user?.uid) loadInitial()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  async function loadInitial() {
    setLoading(true)
    try {
      const snap = await getDocs(query(
        collection(db, 'users', user.uid, 'ratings'),
        orderBy('createdAt', 'desc'),
        limit(10)
      ))
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setRatings(docs)
      setLastDoc(snap.docs[snap.docs.length - 1] || null)
      setHasMore(snap.docs.length === 10)
    } catch (_) {}
    setLoading(false)
  }

  async function loadMore() {
    if (!lastDoc || loadingMore) return
    setLoadingMore(true)
    try {
      const snap = await getDocs(query(
        collection(db, 'users', user.uid, 'ratings'),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(10)
      ))
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setRatings(prev => [...prev, ...docs])
      setLastDoc(snap.docs[snap.docs.length - 1] || null)
      setHasMore(snap.docs.length === 10)
    } catch (_) {}
    setLoadingMore(false)
  }

  const avg = ratings.length
    ? (ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / ratings.length).toFixed(1)
    : '0.0'

  return (
    <div className="page-container">
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-primary">Avaliações</h1>
        <div className="w-6" />
      </div>

      <div className="px-4 py-5 pb-nav">
        {/* Summary — centered */}
        <div className="card flex flex-col items-center gap-3 py-6 mb-5 text-center">
          <p className="text-5xl font-bold text-primary">{avg}</p>
          <Stars rating={Number(avg)} size={22} />
          <div>
            <p className="font-semibold text-gray-800 text-base">{ratings.length} avaliações</p>
            <p className="text-gray-400 text-sm">Média geral</p>
          </div>
        </div>

        {loading && <div className="flex justify-center py-10"><Spinner size={28} color="#375337" /></div>}

        {!loading && ratings.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>Ainda não há avaliações</p>
          </div>
        )}

        {!loading && (
          <div className="flex flex-col gap-3">
            {ratings.map(r => (
              <div key={r.id} className="card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="avatar-circle w-9 h-9 text-sm">
                      {firstName(r.clientName)[0].toUpperCase()}
                    </div>
                    <p className="font-semibold text-gray-800 text-sm">{firstName(r.clientName)}</p>
                  </div>
                  <Stars rating={Number(r.rating) || 0} size={14} />
                </div>
                {r.comment && (
                  <p className="text-gray-600 text-sm italic leading-relaxed">{r.comment}</p>
                )}
                {r.createdAt && (
                  <p className="text-gray-300 text-xs mt-2">
                    {format(r.createdAt.toDate?.() || new Date(r.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                )}
              </div>
            ))}

            {hasMore && (
              <button onClick={loadMore} disabled={loadingMore}
                className="btn-outline w-full mt-2">
                {loadingMore ? <Spinner /> : 'Carregar mais'}
              </button>
            )}
          </div>
        )}
      </div>
      <VetBottomNav />
    </div>
  )
}
