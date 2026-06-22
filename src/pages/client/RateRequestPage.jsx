/**
 * RateRequestPage — Cliente avalia o atendimento após status "finalizado".
 * Rota: /rate/:requestId
 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  doc, getDoc, runTransaction, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { showToast } from '../../components/common/Toast'
import { friendlyError } from '../../utils/errors'
import { ClientBottomNav } from '../../components/common/BottomNav'
import OffersBanner from '../../components/client/OffersBanner'

const STAR_LABELS = ['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente!']
const STAR_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#84cc16', '#f59e0b']

export default function RateRequestPage() {
  const { requestId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [alreadyRated, setAlreadyRated] = useState(false)
  const [existingRating, setExistingRating] = useState(null)
  const [professionalId, setProfessionalId] = useState(null)
  const [professionalName, setProfessionalName] = useState('Profissional')

  const [rating, setRating] = useState(5)
  const [hoveredStar, setHoveredStar] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const activeStar = hoveredStar || rating

  useEffect(() => {
    if (!requestId || !user?.uid) return
    validate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, user?.uid])

  async function validate() {
    setChecking(true)
    try {
      const snap = await getDoc(doc(db, 'requests', requestId))
      if (!snap.exists()) { showToast('Solicitação não encontrada', 'error'); navigate(-1); return }
      const data = snap.data()
      const status = (data.status || '').toLowerCase()
      const isFinal = ['finalizado', 'done', 'concluido', 'completed'].includes(status)

      if (data.clientId !== user.uid || !isFinal) {
        showToast('Sem permissão para avaliar', 'error'); navigate(-1); return
      }

      setProfessionalId(data.professionalId)
      setProfessionalName(data.professionalName || 'Profissional')
      setAllowed(true)

      const ratingSnap = await getDoc(doc(db, 'users', data.professionalId, 'ratings', requestId))
      if (ratingSnap.exists()) { setAlreadyRated(true); setExistingRating(ratingSnap.data()) }
    } catch (e) { showToast(friendlyError(e, 'Não foi possível validar a solicitação.'), 'error') }
    finally { setChecking(false) }
  }

  async function handleSubmit() {
    if (alreadyRated) return showToast('Você já avaliou este atendimento', 'error')
    setSubmitting(true)
    try {
      // Nome completo do perfil (cadastro), com fallback para o display name
      const profileSnap = await getDoc(doc(db, 'users', user.uid)).catch(() => null)
      const clientName = profileSnap?.data()?.name || user.displayName || 'Cliente'
      const ratingRef = doc(db, 'users', professionalId, 'ratings', requestId)
      const requestRef = doc(db, 'requests', requestId)

      // A média do profissional (averageRating/ratingCount) é
      // recalculada no servidor pela Cloud Function onRatingCreated.
      // O cliente não tem (nem deve ter) permissão para alterar o
      // documento de outro usuário.
      await runTransaction(db, async (tx) => {
        const reqSnap = await tx.get(requestRef)

        tx.set(ratingRef, { clientId: user.uid, clientName, rating, comment: comment.trim(), createdAt: serverTimestamp(), requestId })
        tx.set(requestRef, { rated: true, ratedAt: serverTimestamp() }, { merge: true })

        if (reqSnap.exists()) {
          const apId = reqSnap.data()?.appointmentId
          if (apId) tx.set(doc(db, 'appointments', apId), { rated: true, ratedAt: serverTimestamp() }, { merge: true })
        }
      })

      showToast('Avaliação enviada com sucesso!', 'success')
      setAlreadyRated(true)
      setExistingRating({ rating, comment: comment.trim(), clientName })
      // Redireciona para a tela inicial do cliente após avaliar
      setTimeout(() => navigate('/home', { replace: true }), 1600)
    } catch (e) { showToast(friendlyError(e, 'Não foi possível enviar a avaliação.'), 'error') }
    finally { setSubmitting(false) }
  }

  if (checking) return (
    <div className="flex items-center justify-center min-h-screen"><Spinner size={32} color="#375337" /></div>
  )

  return (
    <div className="page-container pb-nav">
      {/* Topbar */}
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="page-title">Avaliar Atendimento</h1>
        <div className="w-6" />
      </div>

      <div className="px-4 py-5 flex flex-col gap-6">
        {/* Professional card — dark green */}
        <div className="rounded-2xl bg-primary px-5 py-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
            {professionalName[0]}
          </div>
          <div>
            <p className="font-bold text-white text-lg">{professionalName}</p>
            <p className="text-white/70 text-sm">Médico Veterinário</p>
          </div>
        </div>

        {!allowed && (
          <div className="text-center py-10 text-gray-400">
            <p>Permissão negada para avaliar este atendimento.</p>
          </div>
        )}

        {allowed && alreadyRated && existingRating && (
          <div className="card flex flex-col items-center gap-5 py-8">
            <div className="bg-green-50 rounded-full p-4">
              <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="font-bold text-gray-800 text-lg">Avaliação enviada!</p>
            <div className="flex gap-2">
              {[1,2,3,4,5].map(i => (
                <svg key={i} className="w-9 h-9" fill={i <= existingRating.rating ? '#f59e0b' : '#e5e7eb'} viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </div>
            {existingRating.comment && (
              <p className="text-gray-500 text-sm text-center italic px-4">"{existingRating.comment}"</p>
            )}
            <p className="text-gray-400 text-xs">Redirecionando para o início...</p>
            <button onClick={() => navigate('/home', { replace: true })} className="btn-primary w-full">
              Voltar ao Início
            </button>
          </div>
        )}

        {allowed && !alreadyRated && (
          <div className="card flex flex-col gap-5">
            {/* Question + star label */}
            <div className="text-center flex flex-col gap-1">
              <p className="font-bold text-gray-900 text-lg">Como foi o atendimento?</p>
              <p className="font-bold text-base" style={{ color: STAR_COLORS[activeStar] }}>
                {STAR_LABELS[activeStar]}
              </p>
            </div>

            {/* Stars */}
            <div className="flex justify-center gap-3">
              {[1,2,3,4,5].map(i => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRating(i)}
                  onMouseEnter={() => setHoveredStar(i)}
                  onMouseLeave={() => setHoveredStar(0)}
                  className="transition-transform hover:scale-110 active:scale-95"
                >
                  <svg
                    className="w-12 h-12 transition-all duration-100"
                    fill={i <= activeStar ? '#f59e0b' : '#e5e7eb'}
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </button>
              ))}
            </div>

            <hr className="border-gray-100" />

            {/* Comment */}
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={4}
              placeholder="Comentário (opcional)"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm
                         outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
                         resize-none transition-colors"
              maxLength={500}
            />
          </div>
        )}

        {/* Submit button */}
        {allowed && !alreadyRated && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary w-full py-4 text-base gap-2"
          >
            {submitting ? <Spinner /> : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                Enviar Avaliação
              </>
            )}
          </button>
        )}

        <OffersBanner audience="client" className="mt-2" />
      </div>
      <ClientBottomNav />
    </div>
  )
}
