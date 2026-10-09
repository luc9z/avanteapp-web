/**
 * Cadastro do veterinário: só o que é preciso para começar a receber
 * pedidos.
 *
 * Antes eram dez coisas numa tela comprida (nome e sobrenome separados,
 * e-mail repetido, CPF, nascimento, bio, 22 especialidades, botão de
 * online). CPF e nascimento não eram usados em lugar nenhum do app. E a
 * única coisa que de fato pesa na busca do cliente, a localização, não
 * era pedida: vet sem base aparece por último no "Perto de mim".
 *
 * Fica: nome (já vem do cadastro), CRMV, telefone, espécies e, em um
 * toque, a localização. Foto, apresentação e documentos vão para Editar
 * Perfil, e o painel lembra o que falta (CartaoCompletarPerfil).
 */
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { clearRoleCache } from '../../services/userRole'
import { cidadeDe } from '../../services/lugar'
import { isValidPhone, isValidCRMV, formatPhone, formatCRMV } from '../../utils/validators'
import { friendlyError } from '../../utils/errors'
import Spinner from '../../components/common/Spinner'
import { showToast } from '../../components/common/Toast'
import MapPicker from '../../components/client/MapPicker'
import { SPECIALTY_GROUPS } from '../../utils/specialties'

const ESPECIES = SPECIALTY_GROUPS[0].items
const CLINICAS = SPECIALTY_GROUPS[1].items

/** Número da etapa; vira um check quando a etapa está pronta. */
function Etapa({ n, pronta, titulo, children, id }) {
  return (
    <section id={id} className="card flex flex-col gap-4 scroll-mt-24">
      <div className="flex items-center gap-3">
        <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          pronta ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
        }`}>
          {pronta ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : n}
        </span>
        <h2 className="text-base font-bold text-gray-800">{titulo}</h2>
      </div>
      {children}
    </section>
  )
}

function Campo({ id, rotulo, ajuda, erro, children }) {
  return (
    <div className="flex flex-col gap-1.5" id={id}>
      <label htmlFor={`${id}-input`} className="text-xs font-semibold text-gray-600">{rotulo}</label>
      {children}
      {erro
        ? <p className="text-xs font-medium text-red-500" role="alert">{erro}</p>
        : ajuda && <p className="text-xs text-gray-400">{ajuda}</p>}
    </div>
  )
}

export default function ConfirmDataPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [nome, setNome] = useState(user?.displayName || '')
  const [crmv, setCrmv] = useState('')
  const [telefone, setTelefone] = useState('')
  const [especies, setEspecies] = useState([])
  const [clinicas, setClinicas] = useState([])
  const [verClinicas, setVerClinicas] = useState(false)

  const [local, setLocal] = useState(null)          // { lat, lng, cidade?, uf? }
  const [buscandoLocal, setBuscandoLocal] = useState(false)
  const [verMapa, setVerMapa] = useState(false)

  const [tentou, setTentou] = useState(false)       // erros só depois da 1ª tentativa
  const [saving, setSaving] = useState(false)

  const erros = {
    nome: nome.trim().split(/\s+/).filter(Boolean).length < 2 ? 'Informe nome e sobrenome.' : null,
    crmv: !isValidCRMV(crmv) ? 'Use a sigla do estado e o número. Ex.: MG 12345' : null,
    telefone: !isValidPhone(telefone) ? 'Informe o telefone com DDD.' : null,
    especies: especies.length === 0 ? 'Escolha pelo menos uma.' : null,
  }
  const erro = k => (tentou ? erros[k] : null)
  const dadosOk = !erros.nome && !erros.crmv && !erros.telefone

  const alternar = (lista, setLista, item) =>
    setLista(l => l.includes(item) ? l.filter(x => x !== item) : [...l, item])

  async function marcarLocal(lat, lng) {
    setLocal({ lat, lng })
    const lugar = await cidadeDe(lat, lng)
    if (lugar) setLocal(l => (l && l.lat === lat && l.lng === lng ? { ...l, ...lugar } : l))
  }

  function usarGps() {
    if (!navigator.geolocation) {
      setVerMapa(true)
      return showToast('Este navegador não informa a localização. Marque no mapa.', 'info')
    }
    setBuscandoLocal(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        await marcarLocal(pos.coords.latitude, pos.coords.longitude)
        setBuscandoLocal(false)
      },
      () => {
        setBuscandoLocal(false)
        setVerMapa(true)
        showToast('Não deu para pegar sua localização. Marque no mapa.', 'info')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function salvar(e) {
    e.preventDefault()
    setTentou(true)
    // Leva até o primeiro problema em vez de um aviso genérico.
    const primeiro = ['nome', 'crmv', 'telefone', 'especies'].find(k => erros[k])
    if (primeiro) {
      const bloco = document.getElementById(`campo-${primeiro}`)
      bloco?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Cursor no campo: o teclado já abre onde precisa corrigir.
      bloco?.querySelector('input, button')?.focus({ preventScroll: true })
      return
    }

    setSaving(true)
    try {
      const partes = nome.trim().split(/\s+/)
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        name: partes.join(' '),
        firstName: partes[0],
        lastName: partes.slice(1).join(' '),
        phone: formatPhone(telefone),
        council: crmv.trim(),
        // Não verificado até checagem manual no SisCad/CFMV (o conselho
        // não oferece API pública de consulta).
        crmvVerified: false,
        specialties: [...especies, ...clinicas],
        profession: 'medico_veterinario',
        is_online: true,
        ...(local && { baseLocation: { lat: local.lat, lng: local.lng } }),
        ...(local?.cidade && { city: local.cidade }),
        ...(local?.uf && { state: local.uf }),
        // createdAt fica o do cadastro da conta: sobrescrever aqui movia
        // a data de entrada do usuário para o dia do perfil.
        updatedAt: serverTimestamp(),
      }, { merge: true })

      clearRoleCache(user.uid)
      showToast('Perfil pronto! Agora escolha seu plano.', 'success')
      navigate('/plans?onboarding=1', { replace: true })
    } catch (err) {
      showToast(friendlyError(err, 'Não foi possível salvar seu perfil.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-container">
      {/* Sem barra inferior do app: o perfil ainda não existe, e ela
          levava para o painel no meio do cadastro. */}
      <div className="topbar">
        <Link to="/user-type" className="text-primary" aria-label="Voltar">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="page-title">Seu perfil profissional</h1>
        <div className="w-6" />
      </div>

      <form onSubmit={salvar} noValidate className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-4">
        <p className="px-1 text-sm text-gray-500">
          Leva um minuto. Foto, apresentação e documentos você completa depois.
        </p>

        {/* ── 1. Dados ─────────────────────────────────────── */}
        <Etapa n={1} pronta={dadosOk} titulo="Seus dados">
          <Campo id="campo-nome" rotulo="Nome que os clientes veem" erro={erro('nome')}>
            <input id="campo-nome-input" value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Ex.: Dra. Maria Silva" autoComplete="name"
              className={`input-field ${erro('nome') ? '!border-red-400' : ''}`} />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="campo-crmv" rotulo="CRMV" ajuda="Sigla do estado e número" erro={erro('crmv')}>
              <input id="campo-crmv-input" value={crmv} onChange={e => setCrmv(formatCRMV(e.target.value))}
                placeholder="MG 12345" autoCapitalize="characters" autoComplete="off"
                className={`input-field ${erro('crmv') ? '!border-red-400' : ''}`} />
            </Campo>
            <Campo id="campo-telefone" rotulo="Telefone (WhatsApp)" erro={erro('telefone')}>
              <input id="campo-telefone-input" value={telefone} onChange={e => setTelefone(formatPhone(e.target.value))}
                placeholder="(34) 99999-9999" type="tel" inputMode="tel" autoComplete="tel-national"
                className={`input-field ${erro('telefone') ? '!border-red-400' : ''}`} />
            </Campo>
          </div>
        </Etapa>

        {/* ── 2. Espécies ──────────────────────────────────── */}
        <Etapa n={2} pronta={especies.length > 0} titulo="Quem você atende" id="campo-especies">
          <div className="grid grid-cols-2 gap-2">
            {ESPECIES.map(s => {
              const ativo = especies.includes(s)
              return (
                <button key={s} type="button" onClick={() => alternar(especies, setEspecies, s)}
                  aria-pressed={ativo}
                  className={`flex min-h-[48px] items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition-all active:scale-[0.98] ${
                    ativo
                      ? 'border-primary bg-primary text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-primary/60'
                  }`}>
                  <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${
                    ativo ? 'border-white/60 bg-white/20' : 'border-gray-300'
                  }`}>
                    {ativo && (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="leading-tight">{s}</span>
                </button>
              )
            })}
          </div>
          {erro('especies') && <p className="-mt-2 text-xs font-medium text-red-500" role="alert">{erro('especies')}</p>}

          <button type="button" onClick={() => setVerClinicas(v => !v)} aria-expanded={verClinicas}
            className="flex min-h-[44px] items-center justify-between rounded-xl px-1 text-sm font-semibold text-primary">
            <span>
              Especialidades clínicas <span className="font-normal text-gray-400">(opcional{clinicas.length ? `, ${clinicas.length}` : ''})</span>
            </span>
            <svg className={`h-4 w-4 transition-transform ${verClinicas ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {verClinicas && (
            <div className="-mt-2 flex flex-wrap gap-2">
              {CLINICAS.map(s => {
                const ativo = clinicas.includes(s)
                return (
                  <button key={s} type="button" onClick={() => alternar(clinicas, setClinicas, s)} aria-pressed={ativo}
                    className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-all ${
                      ativo ? 'border-primary bg-primary text-white' : 'border-gray-300 bg-white text-gray-600 hover:border-primary'
                    }`}>
                    {s}
                  </button>
                )
              })}
            </div>
          )}
        </Etapa>

        {/* ── 3. Localização ───────────────────────────────── */}
        <Etapa n={3} pronta={!!local} titulo="Onde você atende">
          {local ? (
            <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <svg className="h-5 w-5 flex-shrink-0 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800">
                  {local.cidade ? `${local.cidade}${local.uf ? `, ${local.uf}` : ''}` : 'Localização marcada'}
                </p>
                <p className="text-xs text-gray-500">Os clientes verão a distância até você.</p>
              </div>
              {!verMapa && (
                <button type="button" onClick={() => setVerMapa(true)}
                  className="min-h-[44px] flex-shrink-0 px-2 text-xs font-semibold text-primary">
                  Ajustar
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="-mt-1 text-sm text-gray-500">
                A busca do cliente mostra quem está mais perto. Sem localização, você aparece por último.
              </p>
              <button type="button" onClick={usarGps} disabled={buscandoLocal}
                className="btn-outline flex min-h-[48px] w-full items-center justify-center gap-2 disabled:opacity-60">
                {buscandoLocal ? <Spinner /> : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2m0 16v2M2 12h2m16 0h2" />
                  </svg>
                )}
                {buscandoLocal ? 'Localizando...' : 'Usar minha localização'}
              </button>
              {!verMapa && (
                <button type="button" onClick={() => setVerMapa(true)}
                  className="-mt-2 min-h-[44px] text-xs font-semibold text-gray-500 hover:text-primary">
                  Prefiro marcar no mapa
                </button>
              )}
            </>
          )}

          {verMapa && (
            <div className="overflow-hidden rounded-xl">
              <MapPicker lat={local?.lat} lng={local?.lng} height={220}
                onChange={({ lat, lng }) => marcarLocal(lat, lng)} />
              <p className="mt-2 text-xs text-gray-400">Toque no mapa para marcar sua clínica ou de onde você sai.</p>
            </div>
          )}
        </Etapa>

        {/* Botão preso ao rodapé: no celular o fim do formulário fica longe
            do polegar. É sticky DENTRO do formulário, não fixed na janela:
            fixed centralizava pela janela e a coluna pelo contêiner do app,
            e o botão saía torto em relação aos cartões no computador. */}
        <div className="sticky bottom-0 z-20 -mx-4 mt-2 border-t border-gray-100 bg-white/95 px-4 pt-3
                        pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur dark:bg-[#1a221c]/95">
          <button type="submit" disabled={saving} className="btn-primary flex min-h-[52px] w-full items-center justify-center">
            {saving ? <Spinner /> : 'Começar a atender'}
          </button>
        </div>
      </form>
    </div>
  )
}
