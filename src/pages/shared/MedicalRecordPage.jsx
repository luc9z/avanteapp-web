/**
 * MedicalRecordPage — prontuário eletrônico por animal.
 *
 * Rota: /medical-record/:petId
 * Quem pode ver: cliente (dono do animal) + veterinário que já atendeu o animal
 *
 * Estrutura Firestore:
 *   medicalRecords/{petId}/entries/{entryId}  → cada consulta/vacina/exame
 *   medicalRecords/{petId}/weightLog/{logId}  → histórico de peso
 *
 * Campos de entry:
 *   type: 'consulta' | 'vacina' | 'exame' | 'medicamento' | 'cirurgia'
 *   date: Timestamp
 *   title: string
 *   notes: string
 *   vetName: string
 *   vetId: string
 *   attachmentBase64?: string  (imagem de resultado)
 */

import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  collection, doc, getDoc, addDoc, onSnapshot,
  query, orderBy, serverTimestamp, deleteDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { showToast } from '../../components/common/Toast'

const ENTRY_TYPES = [
  { value: 'consulta',     label: 'Consulta',     icon: '🩺', color: 'text-blue-600 bg-blue-50' },
  { value: 'vacina',       label: 'Vacina',        icon: '💉', color: 'text-green-600 bg-green-50' },
  { value: 'exame',        label: 'Exame',         icon: '🔬', color: 'text-purple-600 bg-purple-50' },
  { value: 'medicamento',  label: 'Medicamento',   icon: '💊', color: 'text-orange-600 bg-orange-50' },
  { value: 'cirurgia',     label: 'Cirurgia',      icon: '⚕️', color: 'text-red-600 bg-red-50' },
]

function typeInfo(t) {
  return ENTRY_TYPES.find(e => e.value === t) || ENTRY_TYPES[0]
}

function formatDate(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function resizeImage(file, maxW = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export default function MedicalRecordPage() {
  const { petId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const uid = user?.uid
  const imgRef = useRef()

  const [pet, setPet] = useState(null)
  const [entries, setEntries] = useState([])
  const [weights, setWeights] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showWeightForm, setShowWeightForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('historico') // 'historico' | 'peso'
  const [filterType, setFilterType] = useState('todos')
  const [expandedId, setExpandedId] = useState(null)

  const [form, setForm] = useState({
    type: 'consulta', date: '', title: '', notes: '', vetName: '', attachmentBase64: '',
  })
  const [weightForm, setWeightForm] = useState({ date: '', weight: '' })

  // Carrega dados do animal
  useEffect(() => {
    if (!petId || !uid) return
    getDoc(doc(db, 'pets', petId)).then(snap => {
      if (snap.exists()) setPet({ id: snap.id, ...snap.data() })
      else navigate(-1)
    })
  }, [petId, uid])

  // Entradas do prontuário (realtime)
  useEffect(() => {
    if (!petId) return
    const unsub = onSnapshot(
      query(collection(db, 'medicalRecords', petId, 'entries'), orderBy('date', 'desc')),
      snap => { setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) },
      () => setLoading(false)
    )
    return unsub
  }, [petId])

  // Histórico de peso
  useEffect(() => {
    if (!petId) return
    const unsub = onSnapshot(
      query(collection(db, 'medicalRecords', petId, 'weightLog'), orderBy('date', 'asc')),
      snap => setWeights(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    )
    return unsub
  }, [petId])

  async function handleImagePick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const b64 = await resizeImage(file)
      setForm(f => ({ ...f, attachmentBase64: b64 }))
    } catch {
      showToast('Erro ao carregar imagem', 'error')
    }
  }

  async function saveEntry() {
    if (!form.title.trim()) return showToast('Informe o título', 'error')
    if (!form.date) return showToast('Informe a data', 'error')
    setSaving(true)
    try {
      await addDoc(collection(db, 'medicalRecords', petId, 'entries'), {
        ...form,
        date: new Date(form.date + 'T12:00:00'),
        vetId: uid,
        createdAt: serverTimestamp(),
      })
      setForm({ type: 'consulta', date: '', title: '', notes: '', vetName: '', attachmentBase64: '' })
      setShowForm(false)
      showToast('Entrada adicionada', 'success')
    } catch (e) {
      showToast('Erro ao salvar: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntry(id) {
    if (!confirm('Excluir esta entrada?')) return
    await deleteDoc(doc(db, 'medicalRecords', petId, 'entries', id)).catch(() => {})
  }

  async function saveWeight() {
    if (!weightForm.weight || !weightForm.date) return showToast('Preencha peso e data', 'error')
    setSaving(true)
    try {
      await addDoc(collection(db, 'medicalRecords', petId, 'weightLog'), {
        date: new Date(weightForm.date + 'T12:00:00'),
        weight: parseFloat(weightForm.weight),
        createdAt: serverTimestamp(),
      })
      setWeightForm({ date: '', weight: '' })
      setShowWeightForm(false)
      showToast('Peso registrado', 'success')
    } catch (e) {
      showToast('Erro: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const filteredEntries = filterType === 'todos'
    ? entries
    : entries.filter(e => e.type === filterType)

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen"><Spinner size={32} color="#375337" /></div>
  )

  return (
    <div className="page-container">
      {/* Topbar */}
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex flex-col items-center">
          <h1 className="page-title leading-tight">Prontuário</h1>
          {pet && <p className="text-xs text-gray-400 -mt-0.5">{pet.name} · {pet.species}</p>}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white hover:bg-primary-600 active:scale-90 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex mx-4 mt-1 mb-3 bg-gray-100 rounded-2xl p-1">
        {['historico', 'peso'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === t ? 'bg-white text-primary shadow-sm' : 'text-gray-500'
            }`}>
            {t === 'historico' ? 'Histórico' : 'Peso'}
          </button>
        ))}
      </div>

      <div className="px-4 flex flex-col gap-3">

        {/* ── TAB HISTÓRICO ── */}
        {tab === 'historico' && (
          <>
            {/* Filtro por tipo */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
              <button onClick={() => setFilterType('todos')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  filterType === 'todos' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                Todos ({entries.length})
              </button>
              {ENTRY_TYPES.map(t => (
                <button key={t.value} onClick={() => setFilterType(t.value)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    filterType === t.value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {filteredEntries.length === 0 ? (
              <div className="card text-center py-12 text-gray-400 text-sm">
                {entries.length === 0
                  ? 'Nenhuma entrada no prontuário ainda.\nClique em + para adicionar.'
                  : `Nenhuma entrada do tipo "${filterType}".`}
              </div>
            ) : (
              filteredEntries.map(entry => {
                const ti = typeInfo(entry.type)
                const expanded = expandedId === entry.id
                return (
                  <div key={entry.id} className="card" onClick={() => setExpandedId(expanded ? null : entry.id)}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 ${ti.color}`}>
                        {ti.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm text-gray-800 truncate">{entry.title}</p>
                          <p className="text-xs text-gray-400 flex-shrink-0">{formatDate(entry.date)}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{ti.label}{entry.vetName ? ` · ${entry.vetName}` : ''}</p>
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2" onClick={e => e.stopPropagation()}>
                        {entry.notes && (
                          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{entry.notes}</p>
                        )}
                        {entry.attachmentBase64 && (
                          <img
                            src={entry.attachmentBase64}
                            alt="Anexo"
                            className="rounded-xl max-h-48 object-contain bg-gray-50 border border-gray-100"
                          />
                        )}
                        {(entry.vetId === uid) && (
                          <button onClick={() => deleteEntry(entry.id)}
                            className="text-xs text-red-400 self-end hover:text-red-600 transition-colors">
                            Excluir
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </>
        )}

        {/* ── TAB PESO ── */}
        {tab === 'peso' && (
          <>
            <button onClick={() => setShowWeightForm(true)}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Registrar peso
            </button>

            {weights.length === 0 ? (
              <div className="card text-center py-12 text-gray-400 text-sm">
                Nenhum peso registrado ainda.
              </div>
            ) : (
              <>
                {/* Mini gráfico de linha simples */}
                <div className="card overflow-hidden">
                  <p className="text-xs font-semibold text-gray-500 mb-3">Evolução do peso (kg)</p>
                  <WeightChart data={weights} />
                </div>

                {/* Lista */}
                <div className="flex flex-col gap-2">
                  {[...weights].reverse().map(w => (
                    <div key={w.id} className="card flex items-center gap-3 py-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm">⚖️</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-800">{w.weight} kg</p>
                        <p className="text-xs text-gray-400">{formatDate(w.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

      </div>

      {/* ── MODAL: Nova entrada ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowForm(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-2xl bg-white rounded-t-3xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-800 text-lg">Nova entrada</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tipo */}
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-2 block">Tipo</label>
              <div className="flex flex-wrap gap-2">
                {ENTRY_TYPES.map(t => (
                  <button key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                      form.type === t.value
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Título *</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Vacina V10, Consulta de rotina..."
                className="input-field" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Data *</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="input-field" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Veterinário</label>
                <input type="text" value={form.vetName} onChange={e => setForm(f => ({ ...f, vetName: e.target.value }))}
                  placeholder="Nome do vet"
                  className="input-field" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500">Observações</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Diagnóstico, prescrição, posologia..."
                rows={3} className="input-field resize-none" />
            </div>

            {/* Anexo */}
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-2 block">Anexo (foto/resultado)</label>
              {form.attachmentBase64 ? (
                <div className="relative">
                  <img src={form.attachmentBase64} alt="Anexo" className="rounded-xl max-h-32 object-contain" />
                  <button onClick={() => setForm(f => ({ ...f, attachmentBase64: '' }))}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">✕</button>
                </div>
              ) : (
                <button onClick={() => imgRef.current?.click()}
                  className="w-full h-20 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400 text-sm hover:border-primary/40 transition-colors">
                  📎 Adicionar imagem
                </button>
              )}
              <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
            </div>

            <button onClick={saveEntry} disabled={saving}
              className="btn-primary w-full flex items-center justify-center gap-2">
              {saving ? <Spinner /> : 'Salvar entrada'}
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL: Peso ── */}
      {showWeightForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowWeightForm(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-2xl bg-white rounded-t-3xl p-5 flex flex-col gap-4"
               onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-gray-800 text-lg">Registrar peso</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Data *</label>
                <input type="date" value={weightForm.date}
                  onChange={e => setWeightForm(f => ({ ...f, date: e.target.value }))}
                  className="input-field" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500">Peso (kg) *</label>
                <input type="number" step="0.1" min="0" value={weightForm.weight}
                  onChange={e => setWeightForm(f => ({ ...f, weight: e.target.value }))}
                  placeholder="4.5" className="input-field" />
              </div>
            </div>
            <button onClick={saveWeight} disabled={saving}
              className="btn-primary w-full flex items-center justify-center gap-2">
              {saving ? <Spinner /> : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Gráfico de linha simples (SVG puro, sem biblioteca) ─── */
function WeightChart({ data }) {
  if (data.length < 2) return (
    <p className="text-xs text-gray-400 text-center py-4">Adicione pelo menos 2 registros para ver o gráfico.</p>
  )

  const W = 320, H = 100, PAD = 16
  const weights = data.map(d => d.weight)
  const minW = Math.min(...weights)
  const maxW = Math.max(...weights)
  const range = maxW - minW || 1

  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((d.weight - minW) / range) * (H - PAD * 2)
    return { x, y, w: d.weight }
  })

  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }}>
      <polyline
        points={polyline}
        fill="none"
        stroke="#375337"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill="#375337" />
          <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="9" fill="#666">{p.w}kg</text>
        </g>
      ))}
      {/* Eixo Y mín/máx */}
      <text x={PAD - 2} y={H - PAD + 1} textAnchor="end" fontSize="8" fill="#aaa">{minW}kg</text>
      <text x={PAD - 2} y={PAD + 4} textAnchor="end" fontSize="8" fill="#aaa">{maxW}kg</text>
    </svg>
  )
}
