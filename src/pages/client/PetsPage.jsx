/**
 * PetsPage — cadastro dos animais do cliente + histórico clínico.
 * Pets ficam em users/{uid}/pets; registros clínicos (criados pelo
 * dono ou pelo veterinário durante o atendimento) em .../records.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { ClientBottomNav } from '../../components/common/BottomNav'
import Spinner from '../../components/common/Spinner'
import Modal from '../../components/common/Modal'
import { showToast } from '../../components/common/Toast'
import { friendlyError } from '../../utils/errors'
import OffersBanner from '../../components/client/OffersBanner'
import { format } from 'date-fns'

export const SPECIES = ['Cão', 'Gato', 'Bovino', 'Equino', 'Ave', 'Ovino/Caprino', 'Suíno', 'Outro']
const SPECIES_EMOJI = { 'Cão': '🐶', 'Gato': '🐱', 'Bovino': '🐄', 'Equino': '🐴', 'Ave': '🐔', 'Ovino/Caprino': '🐑', 'Suíno': '🐷', 'Outro': '🐾' }

const EMPTY_PET = { name: '', species: 'Cão', breed: '', weight: '', notes: '' }

export default function PetsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid

  const [pets, setPets] = useState(null)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null) // petId com histórico aberto

  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, 'users', uid, 'pets'),
      snap => setPets(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setPets([]))
  }, [uid])

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
            {pets.map(p => (
              <div key={p.id} className="card flex flex-col">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{SPECIES_EMOJI[p.species] || '🐾'}</span>
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

                <button
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  className="flex items-center justify-center gap-1.5 text-xs font-bold text-primary mt-3 py-2
                             rounded-lg hover:bg-primary/5 transition-colors">
                  <svg className={`w-3.5 h-3.5 transition-transform ${expanded === p.id ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  Histórico clínico
                </button>

                {expanded === p.id && <PetRecords ownerId={uid} petId={p.id} canAdd authorName="Tutor(a)" />}
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setEditing({ ...EMPTY_PET })} className="btn-primary w-full">
          + Cadastrar animal
        </button>
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
              <label className="text-[11px] font-medium text-gray-400 mb-1 block">Nome</label>
              <input value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                className="input-field" placeholder="Rex, Mimosa..." />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">Espécie</label>
                <select value={editing.species} onChange={e => setEditing(p => ({ ...p, species: e.target.value }))}
                  className="select-field">
                  {SPECIES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">Peso (kg)</label>
                <input type="number" step="0.1" min="0" value={editing.weight}
                  onChange={e => setEditing(p => ({ ...p, weight: e.target.value }))}
                  className="input-field" placeholder="12.5" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-400 mb-1 block">Raça (opcional)</label>
              <input value={editing.breed} onChange={e => setEditing(p => ({ ...p, breed: e.target.value }))}
                className="input-field" placeholder="SRD, Angus, Crioulo..." />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-400 mb-1 block">
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
