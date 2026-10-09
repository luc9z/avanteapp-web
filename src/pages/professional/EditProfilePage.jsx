import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { isValidCPF, isValidPhone, formatCPF, formatPhone } from '../../utils/validators'
import { friendlyError } from '../../utils/errors'
import Spinner from '../../components/common/Spinner'
import { showToast } from '../../components/common/Toast'
import AddressSheet from '../../components/client/AddressSheet'
import { VetBottomNav, ClientBottomNav } from '../../components/common/BottomNav'
import MapPicker from '../../components/client/MapPicker'
import { Link } from 'react-router-dom'

import { SPECIALTY_GROUPS } from '../../utils/specialties'
import { reservarCpf, CpfJaCadastrado, ContaJaTemCpf } from '../../services/cpf'

export default function EditProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', cpf: '', email: '', name: '', photoURL: '', bio: '' })
  const [properties, setProperties] = useState([])
  const [isClient, setIsClient] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const [addrOpen, setAddrOpen] = useState(false)
  const [editingProp, setEditingProp] = useState(null)

  // Veterinário: local base + raio de atendimento + especialidades
  const [baseLocation, setBaseLocation] = useState(null) // {lat,lng}
  const [serviceRadius, setServiceRadius] = useState(50)
  const [showBaseMap, setShowBaseMap] = useState(false)
  const [gettingGPS, setGettingGPS] = useState(false)
  const [specialties, setSpecialties] = useState([])
  // CPF já reservado não muda pelo app (só o admin troca).
  const [cpfTravado, setCpfTravado] = useState(false)
  const [portfolio, setPortfolio] = useState([])
  const [savingPortfolio, setSavingPortfolio] = useState(false)

  useEffect(() => {
    if (!user?.uid) return
    // Perfil público + dados privados (CPF fica na subcoleção
    // protegida, legível apenas pelo próprio usuário).
    Promise.all([
      getDoc(doc(db, 'users', user.uid)),
      getDoc(doc(db, 'users', user.uid, 'private', 'profile')).catch(() => null),
    ]).then(([snap, privSnap]) => {
      const d = snap.data() || {}
      const priv = privSnap?.exists?.() ? privSnap.data() : {}
      const fullName = d.name || user.displayName || ''
      setForm({
        firstName: d.firstName || fullName.split(' ')[0] || '',
        lastName: d.lastName || fullName.split(' ').slice(1).join(' ') || '',
        phone: priv.phone || d.phone || '',
        // Compatibilidade: lê CPF do local antigo se ainda existir
        cpf: priv.cpf || d.cpf || '',
        email: d.email || user.email || '',
        name: fullName,
        photoURL: d.photoURL || '',
        bio: d.bio || '',
      })
      setCpfTravado(!!d.cpfHash)
      setProperties(Array.isArray(priv.properties) ? priv.properties
        : Array.isArray(d.properties) ? d.properties : [])
      setIsClient(d.profession === 'client' || !d.profession)
      if (d.baseLocation?.lat != null) setBaseLocation(d.baseLocation)
      if (d.serviceRadius) setServiceRadius(d.serviceRadius)
      if (Array.isArray(d.specialties)) setSpecialties(d.specialties)
      if (Array.isArray(d.portfolio)) setPortfolio(d.portfolio)
    }).catch(() => {
      setForm(f => ({ ...f, email: user.email || '' }))
    }).finally(() => setLoading(false))
  }, [user])

  async function persistProperties(next) {
    setProperties(next)
    try {
      await setDoc(doc(db, 'users', user.uid, 'private', 'profile'),
        { properties: next, updatedAt: serverTimestamp() }, { merge: true })
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível salvar a propriedade.'), 'error')
    }
  }

  function handleSaveProperty(prop) {
    const exists = properties.some(p => p.id === prop.id)
    const next = exists ? properties.map(p => (p.id === prop.id ? prop : p)) : [...properties, prop]
    persistProperties(next)
    showToast('Propriedade salva!', 'success')
  }

  function handleDeleteProperty(id) {
    persistProperties(properties.filter(p => p.id !== id))
  }

  async function persistPortfolio(next) {
    setSavingPortfolio(true)
    try {
      await setDoc(doc(db, 'users', user.uid), { portfolio: next, updatedAt: serverTimestamp() }, { merge: true })
      setPortfolio(next)
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível salvar o portfólio.'), 'error')
    } finally {
      setSavingPortfolio(false)
    }
  }

  function addPortfolioItem() {
    const item = { id: Date.now().toString(), type: 'certificate', title: '', description: '', year: '', imageUrl: '' }
    setPortfolio(prev => [...prev, item])
  }

  function updatePortfolioItem(id, field, value) {
    setPortfolio(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  function removePortfolioItem(id) {
    persistPortfolio(portfolio.filter(i => i.id !== id))
  }

  async function handlePortfolioImage(e, itemId) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return showToast('Selecione uma imagem', 'error')
    try {
      const dataUrl = await resizeImage(file, 512, 0.75)
      updatePortfolioItem(itemId, 'imageUrl', dataUrl)
    } catch { showToast('Não foi possível processar a imagem.', 'error') }
  }

  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-selecionar o mesmo arquivo
    if (!file) return
    if (!file.type.startsWith('image/')) return showToast('Selecione uma imagem', 'error')
    setUploadingPhoto(true)
    try {
      const dataUrl = await resizeImage(file, 256, 0.8)
      // Salva direto no Firestore (data URL pequena, ~30KB) - sem Storage
      await setDoc(doc(db, 'users', user.uid), { photoURL: dataUrl, updatedAt: serverTimestamp() }, { merge: true })
      setForm(f => ({ ...f, photoURL: dataUrl }))
      showToast('Foto atualizada!', 'success')
    } catch (err) {
      showToast('Não foi possível processar a imagem.', 'error')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.firstName.trim()) return showToast('Nome é obrigatório', 'error')
    if (!form.lastName.trim()) return showToast('Sobrenome é obrigatório', 'error')
    if (!isValidPhone(form.phone)) return showToast('Informe um telefone válido com DDD', 'error')
    if (form.cpf.trim() && !isValidCPF(form.cpf)) return showToast('CPF inválido. Confira os dígitos.', 'error')
    setSaving(true)
    try {
      // Um CPF, uma conta: reserva antes de gravar qualquer coisa.
      if (form.cpf.trim() && !cpfTravado) {
        try {
          await reservarCpf(user.uid, form.cpf)
          setCpfTravado(true)
        } catch (err) {
          if (err instanceof CpfJaCadastrado || err instanceof ContaJaTemCpf) {
            showToast(err.message, 'error')
            return
          }
          throw err
        }
      }

      // PRIVACIDADE: o telefone do CLIENTE vai para a subcoleção privada
      // (o vet recebe o contato dentro da própria solicitação). Para o
      // veterinário, o telefone é contato comercial e permanece público.
      await setDoc(doc(db, 'users', user.uid), {
        name: `${form.firstName.trim()} ${form.lastName.trim()}`,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...(!isClient ? { phone: form.phone.trim() } : {}),
        ...(!isClient ? {
          bio: form.bio.trim().slice(0, 600),
          baseLocation: baseLocation || null,
          serviceRadius: Number(serviceRadius) || 50,
          specialties,
        } : {}),
        updatedAt: serverTimestamp(),
      }, { merge: true })
      const privPatch = { updatedAt: serverTimestamp() }
      if (form.cpf.trim()) privPatch.cpf = form.cpf.trim()
      if (isClient) privPatch.phone = form.phone.trim()
      await setDoc(doc(db, 'users', user.uid, 'private', 'profile'), privPatch, { merge: true })
      showToast('Perfil atualizado!', 'success')
      navigate(-1)
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível salvar o perfil.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner size={32} color="#375337" />
    </div>
  )

  return (
    <div className="page-container pb-nav">
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="page-title">Editar Perfil</h1>
        <div className="w-6" />
      </div>

      <form onSubmit={handleSave} className="px-4 py-5 flex flex-col gap-4">
        {/* Avatar com upload */}
        <div className="flex justify-center pb-1">
          <label className="relative cursor-pointer group">
            {form.photoURL ? (
              <img src={form.photoURL} alt="Foto de perfil"
                className="w-24 h-24 rounded-full object-cover border-4 border-primary/20" />
            ) : (
              <div className="avatar-circle w-24 h-24 text-3xl border-4 border-primary/20">
                {form.firstName?.[0] || form.name?.[0] || user?.email?.[0] || '?'}
              </div>
            )}
            <div className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center
                            border-2 border-white shadow-md group-hover:bg-primary-600 transition-colors">
              {uploadingPhoto ? (
                <Spinner size={14} color="white" />
              ) : (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </div>
            <input type="file" accept="image/*" onChange={handlePhoto} disabled={uploadingPhoto} className="hidden" />
          </label>
        </div>

        <div data-coach="perfil-dados" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="field-label">Nome <span className="text-red-500">*</span></label>
              <input
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                placeholder="Maria"
                autoComplete="given-name"
                className="input-field"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="field-label">Sobrenome <span className="text-red-500">*</span></label>
              <input
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                placeholder="Silva"
                autoComplete="family-name"
                className="input-field"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="field-label">Email</label>
            <input value={form.email} readOnly className="input-field bg-gray-50 text-gray-400 cursor-not-allowed" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="field-label">Telefone <span className="text-red-500">*</span></label>
            <input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: formatPhone(e.target.value) }))}
              placeholder="(11) 99999-9999"
              className="input-field"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="field-label">CPF</label>
            <input
              value={form.cpf}
              onChange={e => setForm(f => ({ ...f, cpf: formatCPF(e.target.value) }))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              readOnly={cpfTravado}
              className={`input-field ${cpfTravado ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
            />
            {cpfTravado && (
              <p className="text-[11px] text-gray-400">Para trocar o CPF da conta, fale com o suporte.</p>
            )}
          </div>

          {/* A apresentação aparece para o cliente na página do vet, mas
              só podia ser escrita no primeiro cadastro: depois não havia
              onde mudar. */}
          {!isClient && (
            <div className="flex flex-col gap-1.5" data-coach="perfil-bio">
              <label className="field-label">Apresentação</label>
              <textarea
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value.slice(0, 600) }))}
                rows={4}
                placeholder="Sua formação, há quanto tempo atende e o que mais gosta de fazer."
                className="input-field resize-none"
              />
              <p className="text-[11px] text-gray-400 text-right">{form.bio.length}/600</p>
            </div>
          )}
        </div>

        {/* ── Área de atendimento (apenas veterinário) ────────── */}
        {!isClient && (
          <div data-coach="perfil-area-atend" className="flex flex-col gap-3 border-t border-gray-100 pt-4 mt-1">
            <div>
              <h2 className="section-title">Área de atendimento</h2>
              <p className="text-muted">
                Clientes verão a distância até você na busca. Marque sua base
                (clínica ou residência) e o raio que costuma atender.
              </p>
            </div>

            {(showBaseMap || baseLocation) && (
              <MapPicker
                lat={baseLocation?.lat}
                lng={baseLocation?.lng}
                onChange={({ lat, lng }) => setBaseLocation({ lat, lng })}
                height={200}
              />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={gettingGPS}
                onClick={() => {
                  if (!navigator.geolocation) return showToast('GPS não suportado neste navegador', 'error')
                  setGettingGPS(true)
                  navigator.geolocation.getCurrentPosition(
                    pos => {
                      setBaseLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                      setShowBaseMap(true)
                      setGettingGPS(false)
                    },
                    () => { setGettingGPS(false); showToast('Não foi possível obter o GPS', 'error') },
                    { enableHighAccuracy: true, timeout: 10000 }
                  )
                }}
                className="flex-1 btn-outline py-2.5 text-xs"
              >
                {gettingGPS ? 'Localizando...' : 'Usar meu GPS'}
              </button>
              {!showBaseMap && !baseLocation && (
                <button type="button" onClick={() => setShowBaseMap(true)} className="flex-1 btn-outline py-2.5 text-xs">
                  Marcar no mapa
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="field-label">Raio de atendimento</label>
              <select value={serviceRadius} onChange={e => setServiceRadius(e.target.value)} className="select-field">
                {[10, 20, 30, 50, 80, 120, 200].map(km => (
                  <option key={km} value={km}>{km} km</option>
                ))}
              </select>
            </div>

            {/* ── Especialidades ─────────────────────────────── */}
            <div data-coach="perfil-areas" className="border-t border-gray-100 pt-4">
              <div className="flex items-center">
                <h2 className="section-title flex-1">Áreas de atuação</h2>
                {specialties.length > 0 && (
                  <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {specialties.length} selecionada{specialties.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-muted mb-3">Selecione todas as áreas em que você atende.</p>
              <div className="flex flex-col gap-4">
                {SPECIALTY_GROUPS.map(({ group, items }) => (
                  <div key={group}>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">{group}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map(s => {
                        const active = specialties.includes(s)
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSpecialties(prev =>
                              active ? prev.filter(x => x !== s) : [...prev, s]
                            )}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                              active
                                ? 'bg-primary text-white border-primary shadow-sm'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-primary/40'
                            }`}
                          >
                            {active && <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}{s}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Portfólio e Certificações (apenas veterinário) ─── */}
        {!isClient && (
          <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 mt-1">
            <div className="flex items-center">
              <h2 className="section-title flex-1">Portfólio e Certificações</h2>
              {portfolio.some(i => i.title.trim()) && (
                <button type="button" onClick={() => persistPortfolio(portfolio)} disabled={savingPortfolio}
                  className="text-xs font-semibold text-primary px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
                  {savingPortfolio ? 'Salvando...' : 'Salvar portfólio'}
                </button>
              )}
            </div>
            <p className="text-muted -mt-2">Diplomas, certificados e casos clínicos aparecem no seu perfil público.</p>

            {portfolio.map((item) => (
              <div key={item.id} className="card flex flex-col gap-3 p-4 border border-gray-100">
                <div className="flex items-center gap-2">
                  <select value={item.type} onChange={e => updatePortfolioItem(item.id, 'type', e.target.value)}
                    className="select-field flex-1 text-xs">
                    <option value="certificate">🎓 Certificado / Diploma</option>
                    <option value="case">🔬 Caso Clínico</option>
                    <option value="education">📚 Formação Acadêmica</option>
                  </select>
                  <button type="button" onClick={() => removePortfolioItem(item.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <input value={item.title} onChange={e => updatePortfolioItem(item.id, 'title', e.target.value)}
                  placeholder="Título (ex.: Especialização em Dermatologia)" className="input-field text-sm" />
                <div className="grid grid-cols-3 gap-2">
                  <input value={item.year} onChange={e => updatePortfolioItem(item.id, 'year', e.target.value)}
                    placeholder="Ano" className="input-field text-sm" maxLength={4} />
                  <input value={item.description} onChange={e => updatePortfolioItem(item.id, 'description', e.target.value)}
                    placeholder="Instituição / detalhes" className="input-field text-sm col-span-2" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-primary font-semibold">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {item.imageUrl ? 'Trocar imagem' : 'Adicionar imagem (opcional)'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => handlePortfolioImage(e, item.id)} />
                </label>
                {item.imageUrl && (
                  <div className="relative w-full h-32 rounded-xl overflow-hidden">
                    <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => updatePortfolioItem(item.id, 'imageUrl', '')}
                      className="absolute top-1.5 right-1.5 bg-black/50 text-white p-1 rounded-full hover:bg-black/70">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}

            <button type="button" onClick={addPortfolioItem}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-primary/30 text-primary font-semibold text-sm hover:bg-primary/5 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Adicionar item ao portfólio
            </button>
          </div>
        )}

        <button type="submit" disabled={saving} className="btn-primary w-full py-4 mt-1">
          {saving ? <Spinner /> : 'Salvar alterações'}
        </button>
      </form>

      {/* ── Meus animais (apenas cliente) ───────────────────── */}
      {isClient && (
        <div data-coach="perfil-animais" className="px-4 pb-3">
          <Link to="/pets" className="card flex items-center gap-3 py-3.5 hover:shadow-card-hover transition-all">
            <div className="flex-1">
              <p className="font-bold text-sm text-gray-800">Meus animais</p>
              <p className="text-muted">Cadastro e histórico clínico de cada pet</p>
            </div>
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

      {/* ── Minhas Propriedades (apenas cliente) ──────────────── */}
      {isClient && (
        <div data-coach="perfil-propriedades" className="px-4 pb-8">
          <h2 className="section-title">Minhas Propriedades</h2>
          <p className="text-muted mb-3">
            Cadastre fazendas, sítios ou endereços. Ao agendar, você escolhe para onde o veterinário deve ir.
          </p>

          <div className="flex flex-col gap-2.5">
            {properties.map(p => (
              <div key={p.id} className="card flex items-center gap-3 py-3">
                <div className="bg-primary/10 p-2.5 rounded-xl flex-shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-sm truncate">{p.label}</p>
                  {p.address && <p className="text-gray-400 text-xs truncate">{p.address}</p>}
                  {p.lat != null && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-semibold mt-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      GPS salvo
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setEditingProp(p); setAddrOpen(true) }}
                  className="p-2 text-gray-400 hover:text-primary rounded-lg hover:bg-gray-50 flex-shrink-0"
                  aria-label="Editar"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteProperty(p.id)}
                  className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 flex-shrink-0"
                  aria-label="Excluir"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}

            <button
              onClick={() => { setEditingProp(null); setAddrOpen(true) }}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed
                         border-primary/30 text-primary font-semibold text-sm hover:bg-primary/5 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Adicionar propriedade
            </button>
          </div>
        </div>
      )}

      <AddressSheet
        open={addrOpen}
        onClose={() => setAddrOpen(false)}
        onSave={handleSaveProperty}
        initial={editingProp}
      />

      {!isClient && (
        <div className="px-4 pb-3">
          <Link to="/plans"
            className="card flex items-center gap-3 py-3.5 hover:bg-gray-50 transition-colors no-underline">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-gray-800">Meu plano</p>
              <p className="text-xs text-gray-500">Assinar, trocar de plano ou cancelar</p>
            </div>
            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

      {!isClient && (
        <div className="px-4 pb-4">
          <Link to="/referral"
            className="card flex items-center gap-3 py-3.5 hover:bg-gray-50 transition-colors no-underline">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-gray-800">Programa de Indicações</p>
              <p className="text-xs text-gray-400">Indique colegas e ganhe meses grátis</p>
            </div>
            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}

      {isClient ? <ClientBottomNav /> : <VetBottomNav />}
    </div>
  )
}

/* ── Redimensiona imagem no cliente (canvas) → data URL JPEG ──── */
function resizeImage(file, maxSize = 256, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
