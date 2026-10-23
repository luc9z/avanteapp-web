/**
 * Cadastro do veterinário, começando pelo CPF.
 *
 * O CPF é a porta de entrada: sozinho na tela, ele trava o segundo
 * cadastro da mesma pessoa (services/cpf.js) e, com a consulta publicada,
 * preenche nome e nascimento NA FRENTE da pessoa, com um resumo do que
 * veio dele. Só então aparecem as outras etapas. Sem a consulta (plano
 * Spark), as etapas aparecem do mesmo jeito e a pessoa digita.
 *
 * Fica só o que é preciso para receber pedidos: CPF, nome, CRMV,
 * telefone, espécies e, em um toque, a localização (vet sem base aparece
 * por último no "Perto de mim"). Foto e apresentação vão para Editar
 * Perfil, e o painel lembra o que falta.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { clearRoleCache } from '../../services/userRole'
import { cidadeDe } from '../../services/lugar'
import { consultarCpf, reservarCpf, CpfJaCadastrado, ContaJaTemCpf } from '../../services/cpf'
import { dataBR } from '../../utils/cpf'
import { isValidPhone, isValidCRMV, isValidCPF, formatPhone, formatCRMV, formatCPF } from '../../utils/validators'
import { friendlyError } from '../../utils/errors'
import Spinner from '../../components/common/Spinner'
import { showToast } from '../../components/common/Toast'
import MapPicker from '../../components/client/MapPicker'
import { SPECIALTY_GROUPS } from '../../utils/specialties'
import TelaEntrada from '../../components/common/TelaEntrada'

const ESPECIES = SPECIALTY_GROUPS[0].items
const CLINICAS = SPECIALTY_GROUPS[1].items

const Check = ({ className = 'h-4 w-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
)

/** Número da etapa; vira um check quando a etapa está pronta. */
function Etapa({ n, pronta, titulo, subtitulo, children, id, destaque }) {
  return (
    <section id={id} className={`card flex flex-col gap-4 scroll-mt-24 ${destaque ? 'sm:p-7' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          pronta ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
        }`}>
          {pronta ? <Check /> : n}
        </span>
        <div>
          <h2 className="text-base font-bold text-gray-800">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-sm text-gray-500">{subtitulo}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/** Selo de campo que veio do CPF. */
const SeloDoCpf = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800
                   dark:bg-green-400/15 dark:text-green-300">
    <Check className="h-3 w-3" /> do CPF
  </span>
)

function Campo({ id, rotulo, ajuda, erro, selo, children }) {
  return (
    <div className="flex flex-col gap-1.5" id={id}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${id}-input`} className="text-xs font-semibold text-gray-600">{rotulo}</label>
        {selo}
      </div>
      {children}
      {erro
        ? <p className="text-xs font-medium text-red-500" role="alert">{erro}</p>
        : ajuda && <p className="text-xs text-gray-400">{ajuda}</p>}
    </div>
  )
}

/**
 * Escreve o texto no campo aos poucos, para a pessoa VER o preenchimento.
 * Com "reduzir movimento" ligado no aparelho, escreve de uma vez.
 */
function digitar(texto, setValor, duracaoMs = 550) {
  const semMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (semMovimento || !texto) { setValor(texto); return () => {} }
  const passo = Math.max(1, Math.ceil(texto.length / (duracaoMs / 25)))
  let i = 0
  const id = setInterval(() => {
    i = Math.min(texto.length, i + passo)
    setValor(texto.slice(0, i))
    if (i >= texto.length) clearInterval(id)
  }, 25)
  return () => clearInterval(id)
}

export default function ConfirmDataPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [cpf, setCpf] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [consulta, setConsulta] = useState(null)      // { nome, nascimento } vindos do CPF
  const [semConsulta, setSemConsulta] = useState(false) // consulta indisponível ou CPF sem dados
  const [cpfOcupado, setCpfOcupado] = useState(false)
  // As etapas seguintes aparecem quando o CPF termina. Uma vez abertas,
  // não fecham se a pessoa corrigir um dígito.
  const [revelado, setRevelado] = useState(false)

  const [nome, setNome] = useState(user?.displayName || '')
  const [nascimento, setNascimento] = useState('')
  const [destacar, setDestacar] = useState(false)     // brilho nos campos recém-preenchidos
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
  const pararDigitacao = useRef([])
  // Nome atual para o efeito da consulta decidir sem depender do estado
  // antigo da closure. Decidir DENTRO de setNome(n => ...) rodava a
  // digitação duas vezes no StrictMode.
  const nomeAtual = useRef(nome)
  nomeAtual.current = nome

  // CPF completo: consulta, preenche na frente da pessoa e abre o resto.
  useEffect(() => {
    setCpfOcupado(false)
    setConsulta(null)
    setSemConsulta(false)
    if (!isValidCPF(cpf)) return
    let vivo = true
    setConsultando(true)
    consultarCpf(cpf)
      .then(r => {
        if (!vivo) return
        if (r?.jaCadastrado) return setCpfOcupado(true)
        if (!r) { setSemConsulta(true); setRevelado(true); return }

        setConsulta(r)
        setRevelado(true)
        pararDigitacao.current.forEach(p => p())
        pararDigitacao.current = []
        // Só troca o nome que veio do "Criar conta". Se a pessoa já
        // escreveu outro, é o que ela quer mostrar aos clientes.
        const doCadastro = (user?.displayName || '').trim()
        const n = nomeAtual.current.trim()
        if (!n || n === doCadastro) {
          setNome('')
          pararDigitacao.current.push(digitar(r.nome, setNome))
        }
        if (r.nascimento) pararDigitacao.current.push(digitar(dataBR(r.nascimento), setNascimento, 350))
        setDestacar(true)
        setTimeout(() => setDestacar(false), 1800)
      })
      .finally(() => { if (vivo) setConsultando(false) })
    return () => { vivo = false }
  }, [cpf, user?.displayName])

  useEffect(() => () => pararDigitacao.current.forEach(p => p()), [])

  // O que veio do CPF, para o resumo e os selos. Se a pessoa edita o nome,
  // ele deixa de ser "do CPF".
  const nomeDoCpf = !!consulta && nome.trim() === consulta.nome
  const nascimentoDoCpf = !!consulta?.nascimento
  const preenchidos = [nomeDoCpf && 'Nome', nascimentoDoCpf && 'Data de nascimento'].filter(Boolean)

  const erros = {
    cpf: !isValidCPF(cpf) ? 'CPF inválido. Confira os números.'
      : cpfOcupado ? 'Este CPF já tem uma conta no AVANTE.' : null,
    nome: nome.trim().split(/\s+/).filter(Boolean).length < 2 ? 'Informe nome e sobrenome.' : null,
    crmv: !isValidCRMV(crmv) ? 'Use a sigla do estado e o número. Ex.: MG 12345' : null,
    telefone: !isValidPhone(telefone) ? 'Informe o telefone com DDD.' : null,
    especies: especies.length === 0 ? 'Escolha pelo menos uma.' : null,
  }
  // CPF já cadastrado aparece na hora; os outros, depois de tentar enviar.
  const erro = k => (tentou || (k === 'cpf' && cpfOcupado) ? erros[k] : null)
  const dadosOk = !erros.nome && !erros.crmv && !erros.telefone
  const cpfOk = isValidCPF(cpf) && !cpfOcupado

  const alternar = (setLista, item) =>
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
    const primeiro = ['cpf', 'nome', 'crmv', 'telefone', 'especies'].find(k => erros[k])
    if (primeiro) {
      const bloco = document.getElementById(`campo-${primeiro}`)
      bloco?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Cursor no campo: o teclado já abre onde precisa corrigir.
      bloco?.querySelector('input, button')?.focus({ preventScroll: true })
      return
    }

    setSaving(true)
    try {
      // A trava vem antes de tudo: se o CPF é de outra conta, nada é gravado.
      try {
        await reservarCpf(user.uid, cpf)
      } catch (err) {
        if (err instanceof CpfJaCadastrado) {
          setCpfOcupado(true)
          document.getElementById('campo-cpf')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          return
        }
        if (err instanceof ContaJaTemCpf) return showToast(err.message, 'error')
        throw err
      }

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

      // CPF e nascimento só na área privada, legível pelo próprio usuário.
      await setDoc(doc(db, 'users', user.uid, 'private', 'profile'), {
        cpf: formatCPF(cpf),
        ...(consulta?.nascimento && { birthDate: consulta.nascimento }),
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

  const brilho = destacar ? 'ring-2 ring-green-400/70 transition-shadow' : 'transition-shadow'

  return (
    /* No computador, a mesma moldura do login e do cadastro: a marca e o
       que o vet ganha à esquerda, o formulário à direita. Antes era uma
       faixa estreita no meio de um monitor vazio. */
    <TelaEntrada
      className="lg:!justify-start"
      titulo="Receba pedidos de atendimento da sua região."
      pontos={[
        'Tutores e produtores pedem o atendimento pelo app',
        'Você escolhe quais aceitar e define o seu preço',
        'Sem comissão sobre a visita',
      ]}
    >
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

      <form onSubmit={salvar} noValidate className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-5 sm:pt-8">

        {/* ── 1. CPF: a porta de entrada ─────────────────────── */}
        <Etapa n={1} pronta={cpfOk && !consultando && revelado} destaque
          titulo="Comece pelo seu CPF"
          subtitulo="Com ele a gente preenche seus dados por você."
          id="campo-cpf">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="campo-cpf-input" className="sr-only">CPF</label>
            <div className="relative">
              <input id="campo-cpf-input" value={cpf} onChange={e => setCpf(formatCPF(e.target.value))}
                placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" autoFocus
                className={`input-field !py-4 !text-2xl font-semibold tracking-wider sm:!text-3xl ${
                  erro('cpf') ? '!border-red-400' : cpfOk && !consultando && revelado ? '!border-green-400' : ''
                }`} />
            </div>
            {erro('cpf')
              ? <p className="text-xs font-medium text-red-500" role="alert">{erro('cpf')}</p>
              : <p className="text-xs text-gray-400">Confirma quem você é. Não aparece para os clientes.</p>}
          </div>

          {consultando && (
            <div className="flex items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 text-sm text-gray-600">
              <Spinner /> Buscando seus dados pelo CPF...
            </div>
          )}

          {cpfOcupado && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p>Cada CPF pode ter uma conta só. Se ela é sua, entre com o e-mail dela.</p>
              <button type="button" onClick={async () => { await logout(); navigate('/login', { replace: true }) }}
                className="mt-2 min-h-[40px] text-sm font-bold underline">
                Sair e entrar com a outra conta
              </button>
            </div>
          )}

          {/* O resumo do que o CPF trouxe: a pessoa vê o que foi feito por ela. */}
          {consulta && preenchidos.length > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3.5">
              <p className="flex items-center gap-2 text-sm font-bold text-green-700">
                <Check /> Encontramos seus dados
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Preenchemos {preenchidos.length === 1 ? '1 informação' : `${preenchidos.length} informações`} a partir do CPF:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {preenchidos.map(p => (
                  <span key={p} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-green-700 shadow-sm">
                    <Check className="h-3.5 w-3.5" /> {p}
                  </span>
                ))}
              </div>
              <p className="mt-2.5 text-xs text-gray-500">Confira abaixo e complete o CRMV, o telefone e quem você atende.</p>
            </div>
          )}

          {semConsulta && !consulta && (
            <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
              Não conseguimos buscar seus dados agora. Complete abaixo, leva um minuto.
            </p>
          )}
        </Etapa>

        {revelado && (
          <div className="flex flex-col gap-4 anim-fade-up">
            {/* ── 2. Dados ─────────────────────────────────────── */}
            <Etapa n={2} pronta={dadosOk} titulo="Seus dados">
              <Campo id="campo-nome" rotulo="Nome que os clientes veem" erro={erro('nome')}
                selo={nomeDoCpf && <SeloDoCpf />}>
                <input id="campo-nome-input" value={nome} onChange={e => setNome(e.target.value)}
                  placeholder="Ex.: Dra. Maria Silva" autoComplete="name"
                  className={`input-field ${erro('nome') ? '!border-red-400' : ''} ${nomeDoCpf ? brilho : ''}`} />
              </Campo>

              {nascimentoDoCpf && (
                <Campo id="campo-nascimento" rotulo="Data de nascimento" selo={<SeloDoCpf />}
                  ajuda="Vem do CPF e fica só com você.">
                  <input id="campo-nascimento-input" value={nascimento} readOnly
                    className={`input-field bg-gray-50 text-gray-600 ${brilho}`} />
                </Campo>
              )}

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

            {/* ── 3. Espécies ──────────────────────────────────── */}
            <Etapa n={3} pronta={especies.length > 0} titulo="Quem você atende" id="campo-especies">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ESPECIES.map(s => {
                  const ativo = especies.includes(s)
                  return (
                    <button key={s} type="button" onClick={() => alternar(setEspecies, s)} aria-pressed={ativo}
                      className={`flex min-h-[52px] items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition-all active:scale-[0.98] ${
                        ativo
                          ? 'border-primary bg-primary text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-primary/60'
                      }`}>
                      <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${
                        ativo ? 'border-white/60 bg-white/20' : 'border-gray-300'
                      }`}>
                        {ativo && <Check className="h-3.5 w-3.5" />}
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
                      <button key={s} type="button" onClick={() => alternar(setClinicas, s)} aria-pressed={ativo}
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

            {/* ── 4. Localização ───────────────────────────────── */}
            <Etapa n={4} pronta={!!local} titulo="Onde você atende">
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
                  <MapPicker lat={local?.lat} lng={local?.lng} height={240}
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
          </div>
        )}
      </form>
    </TelaEntrada>
  )
}
