import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { clearRoleCache } from '../../services/userRole'
import { isValidCPF, isValidPhone, isValidCRMV, formatCPF, formatPhone, formatCRMV } from '../../utils/validators'
import { friendlyError } from '../../utils/errors'
import Spinner from '../../components/common/Spinner'
import { DateFields } from '../../components/common/DateTimeFields'
import { showToast } from '../../components/common/Toast'
import { VetBottomNav } from '../../components/common/BottomNav'

const SPECIALTIES = [
  'Pequenos animais', 'Bovinos', 'Equinos', 'Aves', 'Exóticos',
  'Cirurgia', 'Dermatologia', 'Oftalmologia', 'Cardiologia',
  'Oncologia', 'Ortopedia', 'Reprodução', 'Animais Silvestres',
]

/* ── Section header com ícone ──────────────────────────────────── */
function SectionTitle({ icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="bg-primary/10 p-1.5 rounded-lg">
        <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <p className="font-bold text-gray-800 text-sm">{children}</p>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function ConfirmDataPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    firstName: (user?.displayName || '').split(' ')[0] || '',
    lastName: (user?.displayName || '').split(' ').slice(1).join(' ') || '',
    email: user?.email || '',
    phone: '',
    cpf: '',
    birthDate: '',
    council: '',
    bio: '',
  })
  const [selectedSpecialties, setSelectedSpecialties] = useState([])
  const [isOnline, setIsOnline] = useState(true)
  const [saving, setSaving] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    const formatted = name === 'cpf' ? formatCPF(value)
      : name === 'phone' ? formatPhone(value)
      : name === 'council' ? formatCRMV(value)
      : value
    setForm(f => ({ ...f, [name]: formatted }))
  }

  function toggleSpecialty(s) {
    setSelectedSpecialties(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.firstName.trim()) return showToast('Nome é obrigatório', 'error')
    if (!form.lastName.trim()) return showToast('Sobrenome é obrigatório', 'error')
    if (!isValidPhone(form.phone)) return showToast('Informe um telefone válido com DDD', 'error')
    if (!isValidCPF(form.cpf)) return showToast('CPF inválido. Confira os dígitos.', 'error')
    if (!isValidCRMV(form.council)) return showToast('CRMV inválido. Use o formato UF 12345 (ex: RS 12345).', 'error')
    if (selectedSpecialties.length === 0) return showToast('Selecione ao menos uma especialidade', 'error')

    setSaving(true)
    try {
      // Perfil público: visível para clientes na listagem.
      // CPF e data de nascimento NÃO entram aqui — vão para a
      // subcoleção privada, legível apenas pelo próprio usuário
      // (reforçado pelo firestore.rules).
      const publicProfile = {
        uid: user.uid,
        email: form.email || user.email,
        name: `${form.firstName.trim()} ${form.lastName.trim()}`,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        council: form.council.trim(),
        // Marcado como não verificado até checagem manual no SisCad/CFMV
        // (o conselho não oferece API pública de consulta).
        crmvVerified: false,
        bio: form.bio.trim(),
        specialties: selectedSpecialties,
        profession: 'medico_veterinario',
        is_online: isOnline,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      const privateData = {
        cpf: form.cpf.trim(),
        birthDate: form.birthDate,
        updatedAt: serverTimestamp(),
      }

      await setDoc(doc(db, 'users', user.uid), publicProfile, { merge: true })
      await setDoc(doc(db, 'users', user.uid, 'private', 'profile'), privateData, { merge: true })

      clearRoleCache(user.uid)
      showToast('Perfil criado! Agora escolha seu plano.', 'success')
      navigate('/plans?onboarding=1', { replace: true })
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível salvar seu perfil.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'input-field'

  return (
    <div className="page-container pb-nav">
      {/* ── Green hero ──────────────────────────────────────── */}
      <div className="bg-primary px-5 pt-12 pb-6 relative rounded-b-3xl shadow-lg">
        <Link to="/user-type" className="absolute top-4 left-4 text-white/80 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex flex-col items-center gap-2 mt-2">
          <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-white text-lg font-bold">Cadastro Profissional</h1>
          <p className="text-white/70 text-xs text-center">Preencha seus dados para começar a atender</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 pt-4 flex flex-col gap-4">
        {/* ── Dados pessoais ──────────────────────────────── */}
        <div className="card flex flex-col gap-3.5">
          <SectionTitle icon="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z">
            Dados pessoais
          </SectionTitle>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Nome" required>
              <input name="firstName" value={form.firstName} onChange={handleChange}
                placeholder="Maria" autoComplete="given-name" className={inputCls} required />
            </Field>
            <Field label="Sobrenome" required>
              <input name="lastName" value={form.lastName} onChange={handleChange}
                placeholder="Silva" autoComplete="family-name" className={inputCls} required />
            </Field>
          </div>

          <Field label="Email">
            <input name="email" type="email" value={form.email} onChange={handleChange}
              className={`${inputCls} bg-gray-50 text-gray-400 cursor-not-allowed`} readOnly />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefone" required>
              <input name="phone" value={form.phone} onChange={handleChange}
                placeholder="(11) 99999-9999" className={inputCls} required />
            </Field>
            <Field label="CPF" required>
              <input name="cpf" value={form.cpf} onChange={handleChange}
                placeholder="000.000.000-00" className={inputCls} required />
            </Field>
          </div>

          <Field label="Data de nascimento">
            <DateFields
              value={form.birthDate}
              onChange={iso => setForm(f => ({ ...f, birthDate: iso }))}
              fromYear={new Date().getFullYear() - 18}
              toYear={1930}
            />
          </Field>
        </div>

        {/* ── Registro profissional ───────────────────────── */}
        <div className="card flex flex-col gap-3.5">
          <SectionTitle icon="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10">
            Registro profissional
          </SectionTitle>

          <Field label="CRMV" required>
            <input name="council" value={form.council} onChange={handleChange}
              placeholder="SP-12345" className={inputCls} required />
          </Field>

          <Field label="Sobre você (bio)">
            <textarea name="bio" value={form.bio} onChange={handleChange} rows={3}
              placeholder="Conte sua experiência, formação e diferenciais..."
              className={`${inputCls} resize-none`} />
          </Field>
        </div>

        {/* ── Especialidades ──────────────────────────────── */}
        <div className="card">
          <SectionTitle icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z">
            Especialidades <span className="text-red-500">*</span>
          </SectionTitle>
          <p className="text-xs text-gray-400 mb-3 -mt-1">Selecione todas que você atende</p>
          <div className="flex flex-wrap gap-2">
            {SPECIALTIES.map(s => {
              const active = selectedSpecialties.includes(s)
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSpecialty(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    active
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-primary'
                  }`}
                >
                  {active && '✓ '}{s}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Disponibilidade ─────────────────────────────── */}
        <div className="card flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isOnline ? 'bg-green-100' : 'bg-gray-100'}`}>
              <span className={`block w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
            </div>
            <div>
              <p className="font-bold text-sm text-gray-800">Disponível agora</p>
              <p className="text-xs text-gray-400">Aparecer como online para clientes</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOnline(!isOnline)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
              isOnline ? 'bg-primary' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              isOnline ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full py-4 mt-1">
          {saving ? <Spinner /> : 'Salvar e continuar'}
        </button>
      </form>
      <VetBottomNav />
    </div>
  )
}
