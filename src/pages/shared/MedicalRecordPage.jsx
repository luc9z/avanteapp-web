import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, onSnapshot,
  query, where, orderBy, serverTimestamp, deleteDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import { showToast } from '../../components/common/Toast'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import { DateFields } from '../../components/common/DateTimeFields'
import { normalizeStatus } from '../../utils/status'

/**
 * Garante que medicalRecords/{petId} exista com o dono do animal.
 * É esse campo que as regras de segurança consultam para liberar o
 * prontuário (dono + veterinário), então precisa ser gravado ANTES de
 * qualquer entrada nas subcoleções.
 */
export async function ensureRecordOwner(petId, ownerId) {
  if (!petId || !ownerId) return
  await setDoc(
    doc(db, 'medicalRecords', petId),
    { ownerId, petId, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {})
}

/* ── Tipos de entrada ─────────────────────────────────────────── */
const ENTRY_TYPES = [
  { value: 'consulta',    label: 'Consulta',    icon: '🩺', color: 'text-blue-600 bg-blue-50',   desc: 'Atendimento veterinário, diagnóstico' },
  { value: 'vacina',      label: 'Vacina',       icon: '💉', color: 'text-green-600 bg-green-50', desc: 'Imunização, reforços anuais' },
  { value: 'exame',       label: 'Exame',        icon: '🔬', color: 'text-purple-600 bg-purple-50', desc: 'Sangue, raio-X, ultrassom, biópsia' },
  { value: 'medicamento', label: 'Medicamento',  icon: '💊', color: 'text-orange-600 bg-orange-50', desc: 'Remédio, antiparasitário, suplemento' },
  { value: 'cirurgia',    label: 'Cirurgia',     icon: '⚕️', color: 'text-red-600 bg-red-50',    desc: 'Procedimento cirúrgico, anestesia' },
]

// steps por tipo - vacina/medicamento pulam "vet"
const TYPE_STEPS = {
  consulta:    ['type','title','date','vet','notes','attach'],
  vacina:      ['type','title','date','notes','attach','reminder'],
  exame:       ['type','title','date','vet','notes','attach'],
  medicamento: ['type','title','date','notes','reminder'],
  cirurgia:    ['type','title','date','vet','notes','attach'],
}

const TITLE_PLACEHOLDERS = {
  consulta:    'Ex: Consulta de rotina, Retorno, Check-up...',
  vacina:      'Ex: V10, Anti-rábica, Gripe felina...',
  exame:       'Ex: Hemograma completo, Raio-X tórax...',
  medicamento: 'Ex: Amoxicilina 250mg, Frontline Plus...',
  cirurgia:    'Ex: Castração, Extração dentária...',
}

function typeInfo(t) { return ENTRY_TYPES.find(e => e.value === t) || ENTRY_TYPES[0] }

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function formatDate(ts) {
  if (!ts) return '-'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function resizeImage(file, maxW = 800) {
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

/* ══════════════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════════════ */
export default function MedicalRecordPage() {
  const { petId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const uid = user?.uid
  // Os pets vivem em users/{dono}/pets. O dono é o próprio usuário quando
  // ele abre pela aba Animais, ou vem em ?owner= quando um veterinário
  // abre o prontuário a partir de uma solicitação.
  const [searchParams] = useSearchParams()
  const ownerId = searchParams.get('owner') || uid

  const [pet, setPet] = useState(null)
  const [entries, setEntries] = useState([])
  const [weights, setWeights] = useState([])
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [showWeightForm, setShowWeightForm] = useState(false)
  const [savingWeight, setSavingWeight] = useState(false)
  const [tab, setTab] = useState('historico')
  const [filterType, setFilterType] = useState('todos')
  const [expandedId, setExpandedId] = useState(null)
  const [weightForm, setWeightForm] = useState({ date: '', weight: '' })

  useEffect(() => {
    if (!petId || !ownerId) return
    getDoc(doc(db, 'users', ownerId, 'pets', petId))
      .then(snap => {
        if (snap.exists()) setPet({ id: snap.id, ...snap.data() })
        else navigate(-1)
      })
      .catch(() => navigate(-1))
  }, [petId, ownerId])

  useEffect(() => {
    if (!petId) return
    return onSnapshot(
      query(collection(db, 'medicalRecords', petId, 'entries'), orderBy('date', 'desc')),
      snap => { setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) },
      () => setLoading(false)
    )
  }, [petId])

  useEffect(() => {
    if (!petId) return
    return onSnapshot(
      query(collection(db, 'medicalRecords', petId, 'weightLog'), orderBy('date', 'asc')),
      snap => setWeights(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    )
  }, [petId])

  async function deleteEntry(id) {
    const ok = await confirmDialog({
      title: 'Excluir esta entrada?',
      message: 'A anotação sai do prontuário do animal e não há como recuperar.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteDoc(doc(db, 'medicalRecords', petId, 'entries', id))
    } catch (e) {
      // Falha silenciosa aqui daria a impressão de que a entrada sumiu.
      showToast('Não foi possível excluir. Tente novamente.', 'error')
      console.error('[prontuário] exclusão falhou:', e)
    }
  }

  async function saveWeight() {
    if (!weightForm.weight || !weightForm.date) return showToast('Preencha peso e data', 'error')
    setSavingWeight(true)
    try {
      await ensureRecordOwner(petId, ownerId)
      await addDoc(collection(db, 'medicalRecords', petId, 'weightLog'), {
        date: new Date(weightForm.date + 'T12:00:00'),
        weight: parseFloat(weightForm.weight),
        createdAt: serverTimestamp(),
      })
      setWeightForm({ date: '', weight: '' })
      setShowWeightForm(false)
      showToast('Peso registrado', 'success')
    } catch { showToast('Erro ao salvar', 'error') }
    finally { setSavingWeight(false) }
  }

  const filteredEntries = filterType === 'todos' ? entries : entries.filter(e => e.type === filterType)

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner size={32} color="#375337" />
    </div>
  )

  return (
    <div className="page-container largura-leitura">
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
          onClick={() => setWizardOpen(true)}
          className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white hover:bg-primary-600 active:scale-90 transition-all"
          aria-label="Nova entrada"
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

      <div className="px-4 pb-8 flex flex-col gap-3">

        {/* ── TAB HISTÓRICO ── */}
        {tab === 'historico' && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              <FilterChip active={filterType === 'todos'} onClick={() => setFilterType('todos')}>
                Todos ({entries.length})
              </FilterChip>
              {ENTRY_TYPES.map(t => (
                <FilterChip key={t.value} active={filterType === t.value} onClick={() => setFilterType(t.value)}>
                  {t.icon} {t.label}
                </FilterChip>
              ))}
            </div>

            {filteredEntries.length === 0 ? (
              <div className="card text-center py-12 flex flex-col items-center gap-3 text-gray-400">
                <span className="text-4xl">📋</span>
                <p className="text-sm font-medium text-gray-500">
                  {entries.length === 0 ? 'Nenhuma entrada ainda' : `Sem registros do tipo "${filterType}"`}
                </p>
                {entries.length === 0 && (
                  <button onClick={() => setWizardOpen(true)} className="btn-primary px-5 py-2 text-sm mt-1">
                    + Adicionar primeiro registro
                  </button>
                )}
              </div>
            ) : (
              filteredEntries.map(entry => {
                const ti = typeInfo(entry.type)
                const expanded = expandedId === entry.id
                return (
                  <div key={entry.id} className="card cursor-pointer" onClick={() => setExpandedId(expanded ? null : entry.id)}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-[var(--radius-icon)] flex items-center justify-center text-lg flex-shrink-0 ${ti.color}`}>
                        {ti.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm text-gray-800 truncate">{entry.title}</p>
                          <p className="text-xs text-gray-400 flex-shrink-0">{formatDate(entry.date)}</p>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {ti.label}{entry.vetName ? ` · ${entry.vetName}` : ''}
                        </p>
                      </div>
                      <svg className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform mt-1 ${expanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {expanded && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
                        {entry.notes && (
                          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{entry.notes}</p>
                        )}
                        {entry.attachmentBase64 && (
                          <img src={entry.attachmentBase64} alt="Anexo"
                            className="rounded-xl max-h-48 object-contain bg-gray-50 border border-gray-100" />
                        )}
                        {entry.vetId === uid && (
                          <button onClick={() => deleteEntry(entry.id)}
                            className="text-xs text-red-400 self-end hover:text-red-600 transition-colors">
                            Excluir entrada
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
                <div className="card overflow-hidden">
                  <p className="text-xs font-semibold text-gray-500 mb-3">Evolução do peso (kg)</p>
                  <WeightChart data={weights} />
                </div>
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

      {/* ── Wizard conversacional ── */}
      {wizardOpen && (
        <EntryWizard
          pet={pet}
          petId={petId}
          uid={uid}
          ownerId={ownerId}
          onClose={() => setWizardOpen(false)}
          onSaved={() => setWizardOpen(false)}
        />
      )}

      {/* ── Modal peso (simples) ── */}
      {showWeightForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowWeightForm(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full max-w-2xl bg-white rounded-t-3xl p-5 flex flex-col gap-4"
               onClick={e => e.stopPropagation()}>
            <div className="flex justify-center mb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <h2 className="font-bold text-gray-800 text-lg">Registrar peso</h2>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="field-label">Data *</label>
                <DateFields
                  value={weightForm.date}
                  onChange={iso => setWeightForm(f => ({ ...f, date: iso }))}
                  fromYear={new Date().getFullYear()}
                  toYear={new Date().getFullYear() - 20}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="field-label">Peso (kg) *</label>
                <input type="number" step="0.1" min="0" value={weightForm.weight}
                  onChange={e => setWeightForm(f => ({ ...f, weight: e.target.value }))}
                  placeholder="4.5" className="input-field" />
              </div>
            </div>
            <button onClick={saveWeight} disabled={savingWeight} className="btn-primary w-full">
              {savingWeight ? <Spinner /> : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   WIZARD CONVERSACIONAL
══════════════════════════════════════════════════════════════════ */
const WIZARD_BLANK = { type: '', title: '', date: '', vetName: '', notes: '', attachmentBase64: '', nextReminder: '' }

function EntryWizard({ pet, petId, uid, ownerId, onClose, onSaved }) {
  const imgRef = useRef()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [form, setForm] = useState({ ...WIZARD_BLANK, date: localDateStr() })
  const [dateMode, setDateMode] = useState('hoje')
  const [saving, setSaving] = useState(false)
  const [recentVets, setRecentVets] = useState([])

  // Últimos veterinários com atendimento CONCLUÍDO deste cliente -
  // sugestões para preencher o campo "Qual veterinário?" com 1 toque.
  useEffect(() => {
    if (!uid) return
    getDocs(query(collection(db, 'requests'), where('clientId', '==', uid)))
      .then(snap => {
        const seen = new Set()
        const vets = []
        snap.docs
          .map(d => d.data())
          .filter(r => normalizeStatus(r.status) === 'finalizado' && r.professionalName)
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .forEach(r => {
            const name = r.professionalName.trim()
            if (name && !seen.has(name.toLowerCase())) {
              seen.add(name.toLowerCase())
              vets.push(name)
            }
          })
        setRecentVets(vets.slice(0, 5))
      })
      .catch(() => {})
  }, [uid])

  const steps = useMemo(
    () => form.type ? (TYPE_STEPS[form.type] || ['type','title','date','vet','notes','attach']) : ['type'],
    [form.type]
  )
  const current = steps[step]
  const isLast = step === steps.length - 1
  const progress = steps.length > 1 ? step / (steps.length - 1) : 0
  const ti = typeInfo(form.type)

  function goNext() { setDir(1); setStep(s => s + 1) }
  function goBack() {
    if (step === 0) { onClose(); return }
    setDir(-1); setStep(s => s - 1)
  }
  function selectType(type) {
    setForm(f => ({ ...f, type }))
    setDir(1); setStep(1)
  }
  function setToday() {
    setForm(f => ({ ...f, date: localDateStr() }))
    setDateMode('hoje')
  }
  function setYesterday() {
    const d = new Date(); d.setDate(d.getDate() - 1)
    setForm(f => ({ ...f, date: localDateStr(d) }))
    setDateMode('ontem')
  }

  async function save() {
    if (!form.title.trim()) return showToast('Informe o título', 'error')
    if (!form.date) return showToast('Informe a data', 'error')
    setSaving(true)
    try {
      await ensureRecordOwner(petId, ownerId)
      await addDoc(collection(db, 'medicalRecords', petId, 'entries'), {
        type: form.type,
        title: form.title.trim(),
        date: new Date(form.date + 'T12:00:00'),
        vetName: form.vetName.trim(),
        notes: form.notes.trim(),
        attachmentBase64: form.attachmentBase64,
        nextReminder: form.nextReminder ? new Date(form.nextReminder + 'T12:00:00') : null,
        vetId: uid,
        createdAt: serverTimestamp(),
      })
      showToast('Entrada adicionada ✓', 'success')
      onSaved()
    } catch { showToast('Erro ao salvar', 'error') }
    finally { setSaving(false) }
  }

  async function handleImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const b64 = await resizeImage(file)
      setForm(f => ({ ...f, attachmentBase64: b64 }))
    } catch { showToast('Erro ao carregar imagem', 'error') }
  }

  const stepKey = `${step}-${dir}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-2xl bg-white rounded-t-3xl flex flex-col overflow-hidden"
        style={{ minHeight: '58vh', maxHeight: '92vh', boxShadow: 'var(--shadow-sheet)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Barra de progresso + nav */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-2">
          <button onClick={goBack}
            className="p-1 text-gray-400 hover:text-gray-700 transition-colors min-h-0 flex-shrink-0"
            aria-label="Voltar">
            {step === 0
              ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            }
          </button>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(6, progress * 100)}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">{step + 1} / {steps.length}</span>
        </div>

        {/* Badge do tipo (após seleção) */}
        {form.type && (
          <div className="flex justify-center mt-1 mb-0.5">
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${ti.color}`}>
              {ti.icon} {ti.label}
            </span>
          </div>
        )}

        {/* Conteúdo do step - re-monta com animação */}
        <div
          key={stepKey}
          className={`flex-1 px-5 pt-4 pb-6 overflow-y-auto flex flex-col gap-5 ${dir > 0 ? 'wizard-fwd' : 'wizard-back'}`}
        >
          {current === 'type' && (
            <StepType pet={pet} onSelect={selectType} />
          )}
          {current === 'title' && (
            <StepTitle form={form} setForm={setForm} onNext={goNext} />
          )}
          {current === 'date' && (
            <StepDate
              form={form} setForm={setForm}
              dateMode={dateMode}
              onToday={setToday} onYesterday={setYesterday}
              onOther={() => { setDateMode('outra'); setForm(f => ({ ...f, date: '' })) }}
              onNext={isLast ? save : goNext}
              isLast={isLast} saving={saving}
            />
          )}
          {current === 'vet' && (
            <StepVet
              form={form} setForm={setForm}
              recentVets={recentVets}
              onNext={isLast ? save : goNext}
              onSkip={isLast ? save : goNext}
              isLast={isLast} saving={saving}
            />
          )}
          {current === 'notes' && (
            <StepNotes
              form={form} setForm={setForm}
              onNext={isLast ? save : goNext}
              onSkip={isLast ? save : goNext}
              isLast={isLast} saving={saving}
            />
          )}
          {current === 'attach' && (
            <StepAttach
              form={form} setForm={setForm}
              imgRef={imgRef} onSave={isLast ? save : goNext} saving={saving} isLast={isLast}
            />
          )}
          {current === 'reminder' && (
            <StepReminder
              form={form} setForm={setForm}
              onSave={save} onSkip={save} saving={saving}
            />
          )}
        </div>

        {/* Input DENTRO do modal para evitar que file picker dispare onClose */}
        <input
          ref={imgRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImage}
          onClick={e => e.stopPropagation()}
        />
      </div>
    </div>
  )
}

/* ── Steps individuais ─────────────────────────────────────────── */

function StepType({ pet, onSelect }) {
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-gray-900">O que aconteceu?</h2>
        {pet && <p className="text-sm text-gray-400 mt-1">Registrando para {pet.name}</p>}
      </div>
      <div className="flex flex-col gap-2">
        {ENTRY_TYPES.map(t => (
          <button key={t.value} onClick={() => onSelect(t.value)}
            className="flex items-center gap-3 p-4 rounded-2xl border-2 border-transparent bg-gray-50
                       hover:border-primary hover:bg-primary/5 active:scale-[0.98] transition-all text-left">
            <span className={`w-11 h-11 rounded-[var(--radius-icon)] flex items-center justify-center text-xl flex-shrink-0 ${t.color}`}>
              {t.icon}
            </span>
            <div className="flex-1">
              <p className="font-bold text-gray-800 text-sm">{t.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t.desc}</p>
            </div>
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </>
  )
}

function StepTitle({ form, setForm, onNext }) {
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Como descrever?</h2>
        <p className="text-sm text-gray-400 mt-1">Um título curto para identificar o registro</p>
      </div>
      <input
        type="text"
        value={form.title}
        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
        placeholder={TITLE_PLACEHOLDERS[form.type] || 'Digite um título...'}
        className="input-field text-base"
        autoFocus
        onKeyDown={e => e.key === 'Enter' && form.title.trim() && onNext()}
      />
      <button onClick={onNext} disabled={!form.title.trim()} className="btn-primary">
        Avançar
      </button>
    </>
  )
}

function StepDate({ form, setForm, dateMode, onToday, onYesterday, onOther, onNext, isLast, saving }) {
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Quando foi?</h2>
      </div>
      <div className="flex gap-2">
        {[
          { key: 'hoje',  label: 'Hoje',      action: onToday },
          { key: 'ontem', label: 'Ontem',     action: onYesterday },
          { key: 'outra', label: 'Outra data', action: onOther },
        ].map(opt => (
          <button key={opt.key} onClick={opt.action}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all border-2 ${
              dateMode === opt.key
                ? 'border-primary bg-primary text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-primary/40'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>
      {dateMode === 'outra' && (
        <DateFields
          value={form.date}
          onChange={iso => setForm(f => ({ ...f, date: iso }))}
          fromYear={new Date().getFullYear()}
          toYear={new Date().getFullYear() - 20}
        />
      )}
      <button onClick={onNext} disabled={!form.date || saving} className="btn-primary">
        {isLast ? (saving ? <Spinner /> : 'Salvar') : 'Avançar'}
      </button>
    </>
  )
}

function StepVet({ form, setForm, recentVets = [], onNext, onSkip, isLast, saving }) {
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Qual veterinário?</h2>
        <p className="text-sm text-gray-400 mt-1">Opcional: quem realizou o atendimento</p>
      </div>

      {recentVets.length > 0 && (
        <div>
          <p className="field-label">Atendimentos recentes</p>
          <div className="flex flex-col gap-2">
            {recentVets.map(name => {
              const active = form.vetName.trim() === name
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, vetName: name }))}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                    active ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-primary/40'
                  }`}
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {name[0]?.toUpperCase() || '?'}
                  </span>
                  <span className={`flex-1 font-semibold text-sm ${active ? 'text-primary' : 'text-gray-800'}`}>
                    {name}
                  </span>
                  {active && (
                    <svg className="w-5 h-5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        {recentVets.length > 0 && <p className="field-label">Ou informe outro</p>}
        <input
          type="text" value={form.vetName}
          onChange={e => setForm(f => ({ ...f, vetName: e.target.value }))}
          placeholder="Dr. Carlos, Clínica PetSaúde..."
          className="input-field"
          onKeyDown={e => e.key === 'Enter' && onNext()}
        />
      </div>

      <div className="flex flex-col gap-2">
        <button onClick={onNext} disabled={saving} className="btn-primary">
          {isLast ? (saving ? <Spinner /> : 'Salvar') : 'Avançar'}
        </button>
        <button onClick={onSkip} disabled={saving}
          className="text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors">
          {isLast ? 'Salvar sem informar' : 'Pular'}
        </button>
      </div>
    </>
  )
}

function StepNotes({ form, setForm, onNext, onSkip, isLast, saving }) {
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Observações</h2>
        <p className="text-sm text-gray-400 mt-1">Diagnóstico, prescrição, posologia, próximo reforço...</p>
      </div>
      <textarea
        rows={4} value={form.notes}
        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        placeholder="Escreva aqui..."
        className="input-field resize-none"
        autoFocus
      />
      <div className="flex flex-col gap-2">
        <button onClick={onNext} disabled={saving} className="btn-primary">
          {isLast ? (saving ? <Spinner /> : 'Salvar') : 'Avançar'}
        </button>
        <button onClick={onSkip} disabled={saving}
          className="text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors">
          {isLast ? 'Salvar sem observações' : 'Pular'}
        </button>
      </div>
    </>
  )
}

function StepAttach({ form, setForm, imgRef, onSave, saving, isLast }) {
  const btnLabel = isLast ? (saving ? <Spinner /> : 'Salvar') : 'Avançar'
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Foto ou resultado?</h2>
        <p className="text-sm text-gray-400 mt-1">Opcional: exame, receita, carteirinha de vacinação...</p>
      </div>

      {form.attachmentBase64 ? (
        <div className="relative rounded-2xl overflow-hidden border border-gray-100">
          <img src={form.attachmentBase64} alt="Anexo"
            className="w-full max-h-52 object-contain bg-gray-50" />
          <button
            onClick={() => setForm(f => ({ ...f, attachmentBase64: '' }))}
            className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-sm shadow-md min-h-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      ) : (
        <button onClick={() => imgRef.current?.click()}
          className="w-full py-10 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-primary/40 hover:bg-primary/5 transition-colors">
          <span className="text-sm font-medium">Toque para adicionar foto</span>
          <span className="text-xs">JPG, PNG, PDF de resultado</span>
        </button>
      )}

      <div className="flex flex-col gap-2">
        <button onClick={onSave} disabled={saving} className="btn-primary">
          {btnLabel}
        </button>
        {!form.attachmentBase64 && (
          <button onClick={onSave} disabled={saving}
            className="text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors">
            {isLast ? 'Salvar sem foto' : 'Pular'}
          </button>
        )}
      </div>
    </>
  )
}

function StepReminder({ form, setForm, onSave, onSkip, saving }) {
  function addDays(n) {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return localDateStr(d)
  }
  const PRESETS = [
    { label: '30 dias',  days: 30 },
    { label: '3 meses',  days: 90 },
    { label: '6 meses',  days: 180 },
    { label: '1 ano',    days: 365 },
  ]
  return (
    <>
      <div>
        <h2 className="text-xl font-bold text-gray-900">Próximo lembrete?</h2>
        <p className="text-sm text-gray-400 mt-1">Opcional: reforço, nova dose, retorno</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map(p => {
          const val = addDays(p.days)
          const active = form.nextReminder === val
          return (
            <button key={p.days} onClick={() => setForm(f => ({ ...f, nextReminder: active ? '' : val }))}
              className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                active ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-primary/40'
              }`}>
              {p.label}
            </button>
          )
        })}
      </div>
      <div className="flex flex-col gap-1">
        <label className="field-label">Ou escolha uma data</label>
        <DateFields
          value={form.nextReminder}
          onChange={iso => setForm(f => ({ ...f, nextReminder: iso }))}
          fromYear={new Date().getFullYear()}
          toYear={new Date().getFullYear() + 3}
          noPast
        />
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={onSave} disabled={saving} className="btn-primary">
          {saving ? <Spinner /> : 'Salvar'}
        </button>
        <button onClick={onSkip} disabled={saving}
          className="text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors">
          Salvar sem lembrete
        </button>
      </div>
    </>
  )
}

/* ── Utilitários ─────────────────────────────────────────────── */

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
        active ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}>
      {children}
    </button>
  )
}

function WeightChart({ data }) {
  if (data.length < 2) return (
    <p className="text-xs text-gray-400 text-center py-4">Adicione pelo menos 2 registros para ver o gráfico.</p>
  )
  const W = 320, H = 100, PAD = 18
  const vals = data.map(d => d.weight)
  const minW = Math.min(...vals), maxW = Math.max(...vals)
  const range = maxW - minW || 1
  const pts = data.map((d, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - PAD * 2),
    y: H - PAD - ((d.weight - minW) / range) * (H - PAD * 2),
    w: d.weight,
  }))
  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }}>
      <polyline points={polyline} fill="none" stroke="#375337" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill="#375337" />
          <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="9" fill="#666">{p.w}kg</text>
        </g>
      ))}
      <text x={PAD - 2} y={H - PAD + 1} textAnchor="end" fontSize="8" fill="#aaa">{minW}kg</text>
      <text x={PAD - 2} y={PAD + 4} textAnchor="end" fontSize="8" fill="#aaa">{maxW}kg</text>
    </svg>
  )
}
