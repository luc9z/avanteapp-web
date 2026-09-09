/**
 * PetsPage - cadastro dos animais do cliente + histórico clínico.
 * Pets ficam em users/{uid}/pets; registros clínicos (criados pelo
 * dono ou pelo veterinário durante o atendimento) em .../records.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  getDocs, query, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { ClientBottomNav } from '../../components/common/BottomNav'
import Spinner from '../../components/common/Spinner'
import Modal from '../../components/common/Modal'
import { showToast } from '../../components/common/Toast'
import { friendlyError } from '../../utils/errors'
import OffersBanner from '../../components/client/OffersBanner'
import { ensureRecordOwner } from '../shared/MedicalRecordPage'
import { format, differenceInDays } from 'date-fns'

export const SPECIES = ['Cão', 'Gato', 'Bovino', 'Equino', 'Ave', 'Ovino/Caprino', 'Suíno', 'Outro']
const SPECIES_EMOJI_DISPLAY = { 'Cão': '🐶', 'Gato': '🐱', 'Bovino': '🐄', 'Equino': '🐴', 'Ave': '🐔', 'Ovino/Caprino': '🐑', 'Suíno': '🐷', 'Outro': '🐾' }

const ENTRY_TYPES = ['consulta', 'vacina', 'exame', 'medicamento', 'cirurgia']
const ENTRY_TYPE_LABEL = { consulta: 'Consulta', vacina: 'Vacina', exame: 'Exame', medicamento: 'Medicamento', cirurgia: 'Cirurgia' }

const EMPTY_PET = { name: '', species: 'Cão', breed: '', weight: '', notes: '' }
const EMPTY_BATCH = { type: 'vacina', title: '', date: '', notes: '' }

export default function PetsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid

  const [pets, setPets] = useState(null)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch] = useState('')
  const [reminders, setReminders] = useState([])
  const [batchOpen, setBatchOpen] = useState(false)

  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'pets'),
      snap => setPets(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setPets([]))
  }, [uid])

  // Fetch upcoming reminders from all pets' medicalRecords entries
  useEffect(() => {
    if (!pets || pets.length === 0) { setReminders([]); return }
    const today = new Date(); today.setHours(0, 0, 0, 0)
    Promise.all(pets.map(async pet => {
      try {
        const snap = await getDocs(collection(db, 'medicalRecords', pet.id, 'entries'))
        return snap.docs
          .map(d => ({ petId: pet.id, petName: pet.name, petEmoji: SPECIES_EMOJI_DISPLAY[pet.species] || '🐾', entryId: d.id, ...d.data() }))
          .filter(e => e.nextReminder?.toDate?.() >= today)
      } catch { return [] }
    })).then(results => {
      const all = results.flat().sort((a, b) => a.nextReminder.toDate() - b.nextReminder.toDate())
      setReminders(all.slice(0, 10))
    })
  }, [pets])

  async function savePet() {
    const p = editing
    if (!p.name.trim()) return showToast('Dê um nome ao animal', 'error')
    try {
      const data = {
        name: p.name.trim(),
        species: p.species,
        breed: (p.breed || '').trim(),
        weight: p.weight ? Number(p.weight) : null,
        notes: (p.notes || '').trim(),
        updatedAt: serverTimestamp(),
      }
      if (p.id) await updateDoc(doc(db, 'users', uid, 'pets', p.id), data)
      else await addDoc(collection(db, 'users', uid, 'pets'), { ...data, createdAt: serverTimestamp() })
      setEditing(null)
      showToast('Animal salvo!', 'success')
    } catch (e) { showToast(friendlyError(e), 'error') }
  }

  async function removePet(id) {
    try { await deleteDoc(doc(db, 'users', uid, 'pets', id)); setEditing(null) }
    catch (e) { showToast(friendlyError(e), 'error') }
  }

  return (
    <div className="page-container">
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary" aria-label="Voltar">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="page-title">Meus animais</h1>
        <div className="w-6" />
      </div>

      <div className="px-4 py-4 pb-nav flex flex-col gap-3">
        <OffersBanner audience="client" />

        {/* Upcoming reminders */}
        {reminders.length > 0 && (
          <div className="card flex flex-col gap-0 overflow-hidden">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">🔔 Próximos lembretes</p>
            {reminders.map((r, i) => {
              const dt = r.nextReminder.toDate()
              const days = differenceInDays(dt, new Date())
              const overdue = days < 0
              const soon = days <= 7
              return (
                <div key={r.entryId} className={`flex items-center gap-3 py-2.5 ${i < reminders.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <span className="text-xl">{r.petEmoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{r.title}</p>
                    <p className="text-xs text-gray-400">{r.petName} · {format(dt, 'dd/MM/yyyy')}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    overdue ? 'bg-red-100 text-red-600' : soon ? 'bg-amber-100 text-amber-600' : 'bg-green-50 text-green-700'
                  }`}>
                    {overdue ? 'Vencido' : days === 0 ? 'Hoje' : `${days}d`}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Search */}
        {pets && pets.length > 4 && (
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, espécie ou raça..."
              className="input-field pl-9 text-sm"
            />
          </div>
        )}

        {pets === null ? (
          <div className="flex justify-center py-20"><Spinner size={28} color="#375337" /></div>
        ) : pets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-gray-400 py-16 text-center animate-fade-up">
            <span className="text-5xl">🐾</span>
            <p className="text-sm font-medium text-gray-500">Nenhum animal cadastrado</p>
            <p className="text-xs max-w-xs">
              Cadastre seus animais para agilizar as solicitações e manter o histórico
              clínico de cada um em um só lugar.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 stagger">
            {(search
              ? pets.filter(p => {
                  const q = search.toLowerCase()
                  return (p.name || '').toLowerCase().includes(q)
                    || (p.species || '').toLowerCase().includes(q)
                    || (p.breed || '').toLowerCase().includes(q)
                })
              : pets
            ).map(p => (
              <div key={p.id} className="card flex flex-col">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{SPECIES_EMOJI_DISPLAY[p.species] || '🐾'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      {[p.species, p.breed, p.weight ? `${p.weight} kg` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button onClick={() => setEditing({ ...p, weight: p.weight ?? '' })}
                    className="text-gray-300 hover:text-primary p-1.5" aria-label="Editar">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>

                {p.notes && <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg px-3 py-2">{p.notes}</p>}

                <div className="flex gap-2 mt-3">
                  <button
                    data-coach="pet-card"
                    onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-primary py-2
                               rounded-lg hover:bg-primary/5 transition-colors">
                    <svg className={`w-3.5 h-3.5 transition-transform ${expanded === p.id ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                    Notas rápidas
                  </button>
                  <a href={`/medical-record/${p.id}`}
                    className="flex-1 flex items-center justify-center gap-1 text-xs font-bold text-primary py-2
                               rounded-lg hover:bg-primary/5 transition-colors no-underline border border-primary/20">
                    Prontuário completo
                  </a>
                </div>

                {expanded === p.id && <PetRecords ownerId={uid} petId={p.id} canAdd authorName="Tutor(a)" />}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button data-coach="pet-add" onClick={() => setEditing({ ...EMPTY_PET })} className="btn-primary flex-1">
            + Cadastrar animal
          </button>
          {pets && pets.length > 1 && (
            <button onClick={() => setBatchOpen(true)} className="btn-outline whitespace-nowrap"
              title="Registrar vacina, exame ou medicação em vários animais de uma vez">
              Em lote
            </button>
          )}
        </div>
      </div>

      <ClientBottomNav />

      {/* Modal cadastro/edição */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar animal' : 'Novo animal'}
        footer={
          <>
            {editing?.id && (
              <button onClick={() => removePet(editing.id)} className="text-red-500 text-sm font-semibold mr-auto px-2">
                Excluir
              </button>
            )}
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-gray-500 font-medium">Cancelar</button>
            <button onClick={savePet} className="btn-primary px-6 py-2">Salvar</button>
          </>
        }>
        {editing && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="field-label">Nome</label>
              <input value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                className="input-field" placeholder="Rex, Mimosa..." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">Espécie</label>
                <select value={editing.species} onChange={e => setEditing(p => ({ ...p, species: e.target.value }))}
                  className="select-field">
                  {SPECIES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Peso (kg)</label>
                <input type="number" step="0.1" min="0" value={editing.weight}
                  onChange={e => setEditing(p => ({ ...p, weight: e.target.value }))}
                  className="input-field" placeholder="12.5" />
              </div>
            </div>
            <div>
              <label className="field-label">Raça (opcional)</label>
              <input value={editing.breed} onChange={e => setEditing(p => ({ ...p, breed: e.target.value }))}
                className="input-field" placeholder="SRD, Angus, Crioulo..." />
            </div>
            <div>
              <label className="field-label">
                Observações (vacinas, alergias, castração...)
              </label>
              <textarea rows={3} value={editing.notes}
                onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))}
                className="input-field resize-none"
                placeholder="V10 em dia · castrado · alérgico a dipirona" />
            </div>
          </div>
        )}
      </Modal>

      {/* Batch modal */}
      {batchOpen && pets && (
        <BatchModal
          pets={pets}
          uid={uid}
          onClose={() => setBatchOpen(false)}
          onSaved={() => { setBatchOpen(false); showToast('Registro salvo em lote ✓', 'success') }}
        />
      )}
    </div>
  )
}

/* ── Batch registration modal ─────────────────────────────────── */
function BatchModal({ pets, uid, onClose, onSaved }) {
  const [filterSpecies, setFilterSpecies] = useState('')
  const [selected, setSelected] = useState([])
  const [form, setForm] = useState({ ...EMPTY_BATCH, date: new Date().toISOString().slice(0, 10) })
  const [saving, setSaving] = useState(false)

  const uniqueSpecies = [...new Set(pets.map(p => p.species))]
  const filtered = filterSpecies ? pets.filter(p => p.species === filterSpecies) : pets

  function togglePet(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  function toggleAll() {
    const ids = filtered.map(p => p.id)
    const allSel = ids.every(id => selected.includes(id))
    setSelected(allSel ? selected.filter(id => !ids.includes(id)) : [...new Set([...selected, ...ids])])
  }

  async function save() {
    if (!form.title.trim()) return showToast('Informe o título', 'error')
    if (!form.date) return showToast('Informe a data', 'error')
    if (selected.length === 0) return showToast('Selecione ao menos um animal', 'error')
    setSaving(true)
    try {
      await Promise.all(selected.map(async petId => {
        // O doc-pai guarda o dono - base do controle de acesso do prontuário.
        await ensureRecordOwner(petId, uid)
        return addDoc(collection(db, 'medicalRecords', petId, 'entries'), {
          type: form.type,
          title: form.title.trim(),
          date: new Date(form.date + 'T12:00:00'),
          vetName: '',
          notes: form.notes.trim(),
          attachmentBase64: '',
          nextReminder: null,
          vetId: uid,
          createdAt: serverTimestamp(),
        })
      }))
      onSaved()
    } catch (e) {
      showToast(friendlyError(e), 'error')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl px-5 pt-5 pb-10 flex flex-col gap-4
                      max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto -mt-1 mb-1" />

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Registrar em lote</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 leading-none" aria-label="Fechar"><svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label">Tipo</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="select-field">
                {ENTRY_TYPES.map(t => <option key={t} value={t}>{ENTRY_TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Data</label>
              <input type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="input-field" />
            </div>
          </div>
          <div>
            <label className="field-label">Título / produto</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="input-field" placeholder="V10, Ivermectina 1%, Exame de sangue..." />
          </div>
          <div>
            <label className="field-label">Observações (opcional)</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="input-field resize-none text-sm" placeholder="Dose, lote, reações..." />
          </div>
        </div>

        <div className="h-px bg-gray-100" />

        {/* Species filter */}
        {uniqueSpecies.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFilterSpecies('')}
              className={`px-3.5 py-2 min-h-[40px] rounded-full text-xs font-bold border transition-all
                          duration-200 hover:-translate-y-px active:translate-y-0 ${
                !filterSpecies
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 text-gray-600 hover:border-primary/40'
              }`}>
              Todos
            </button>
            {uniqueSpecies.map(sp => (
              <button key={sp} onClick={() => setFilterSpecies(filterSpecies === sp ? '' : sp)}
                className={`px-3.5 py-2 min-h-[40px] rounded-full text-xs font-bold border transition-all
                            duration-200 hover:-translate-y-px active:translate-y-0 ${
                  filterSpecies === sp
                    ? 'bg-primary text-white border-primary'
                    : 'border-gray-200 text-gray-600 hover:border-primary/40'
                }`}>
                {sp}
              </button>
            ))}
          </div>
        )}

        {/* Pet checklist */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              {selected.length} de {filtered.length} selecionado{selected.length !== 1 ? 's' : ''}
            </p>
            <button onClick={toggleAll} className="text-xs text-primary font-bold px-2 py-1.5 rounded-lg
                                                   hover:bg-primary/5 transition-colors">
              {filtered.every(p => selected.includes(p.id)) ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          </div>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-0.5">
            {filtered.map(p => {
              const marcado = selected.includes(p.id)
              return (
                <label key={p.id} className={`pet-lote ${marcado ? 'pet-lote-on' : ''}`}>
                  <input type="checkbox" className="sr-only"
                    checked={marcado} onChange={() => togglePet(p.id)} />
                  {/* Caixa desenhada: a nativa some no escuro e tem 16px,
                      pequena demais para o dedo. */}
                  <span aria-hidden className="pet-lote-caixa">
                    {marcado && (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor"
                        strokeWidth={3.2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-gray-800 truncate">{p.name}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {[p.species, p.breed].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <button onClick={save} disabled={saving || selected.length === 0} className="btn-primary btn-block">
          {saving
            ? <Spinner />
            : selected.length === 0
              ? 'Escolha ao menos um animal'
              : `Salvar em ${selected.length} animal${selected.length !== 1 ? 'is' : ''}`}
        </button>
      </div>
    </div>
  )
}

/* ── Histórico clínico (reutilizado também pelo veterinário) ──── */
export function PetRecords({ ownerId, petId, canAdd = false, professionalId = null, authorName = '' }) {
  const [records, setRecords] = useState(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!ownerId || !petId) return
    return onSnapshot(
      query(collection(db, 'users', ownerId, 'pets', petId, 'records'), orderBy('createdAt', 'desc')),
      snap => setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setRecords([]))
  }, [ownerId, petId])

  async function addRecord() {
    if (!text.trim()) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'users', ownerId, 'pets', petId, 'records'), {
        text: text.trim().slice(0, 1000),
        authorName: authorName || 'Anotação',
        professionalId: professionalId || null,
        createdAt: serverTimestamp(),
      })
      setText('')
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível salvar o registro.'), 'error')
    } finally { setSaving(false) }
  }

  return (
    <div className="mt-1 flex flex-col gap-2 animate-fade-up">
      {records === null ? (
        <div className="flex justify-center py-4"><Spinner size={18} color="#375337" /></div>
      ) : records.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">Nenhum registro ainda.</p>
      ) : (
        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
          {records.map(r => (
            <div key={r.id} className="bg-gray-50 rounded-xl px-3 py-2.5 border-l-[3px] border-primary/40">
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{r.text}</p>
              <p className="text-[10px] text-gray-400 mt-1.5">
                {r.professionalId ? '🩺 ' : ''}{r.authorName || 'Registro'}
                {r.createdAt?.toDate ? ` · ${format(r.createdAt.toDate(), 'dd/MM/yyyy HH:mm')}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <div className="flex gap-2 items-end">
          <textarea
            rows={2}
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={1000}
            placeholder="Nova anotação (vacina aplicada, sintoma, medicação...)"
            className="input-field resize-none text-xs flex-1"
          />
          <button onClick={addRecord} disabled={!text.trim() || saving}
            className="btn-primary px-4 py-2.5 text-xs flex-shrink-0">
            {saving ? <Spinner size={14} /> : 'Salvar'}
          </button>
        </div>
      )}
    </div>
  )
}
