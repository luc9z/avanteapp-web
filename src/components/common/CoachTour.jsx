/**
 * CoachTour - tutoriais interativos do app.
 *
 * A tela escurece e só o elemento explicado continua visível e
 * clicável; o resto fica realmente inerte (a máscara captura o toque).
 * Sempre dá para "Pular" e liberar o app.
 *
 * São dois tipos de roteiro:
 *  - `primeiro`: conduz o cliente a fazer um agendamento de verdade.
 *    Atravessa páginas e só avança quando a pessoa toca no elemento
 *    certo - por isso o componente fica montado no App, fora das rotas.
 *  - por aba: ao entrar pela primeira vez em cada aba, destaca seus
 *    elementos e avança por botão (exigir o clique levaria a pessoa
 *    para fora da tela que está sendo explicada).
 *
 * Cada roteiro é marcado como visto separadamente, então concluir um
 * não silencia os outros.
 *
 * Os alvos são marcados no JSX com `data-coach="..."`, não por classe
 * CSS, para que mudanças de estilo não quebrem o tutorial.
 *
 * Posicionamento pensado para celular primeiro: o balão só é desenhado
 * depois de medido, e a página rola até que o elemento destacado E a
 * explicação caibam juntos na tela. Sem isso, no celular o alvo ficava
 * no topo e o texto fora do campo de visão.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { readUser, writeUser } from '../../services/userStorage'

const KEY = 'avante-coach-v2'
const PAD = 8          // respiro entre o recorte e o elemento
const RADIUS = 18      // canto do recorte
const GAP = 14         // distância entre o recorte e o balão
const SAFE = 12        // margem mínima até a borda da tela
const TOP_SAFE = 76    // altura da topbar fixa
const BUBBLE_MAX = 384 // largura máxima do balão (desktop)

/* ── Estado persistido ────────────────────────────────────────────
   Guarda { done: { [tourId]: true }, step: n, current: tourId }.
   Cada aba tem seu próprio tutorial e é marcada separadamente. */
/**
 * Espelho em memória do que já foi mostrado. Existe porque em aba
 * anônima ou com storage bloqueado o localStorage falha em silêncio -
 * e sem isso o tutorial reapareceria a cada navegação.
 */
const vistoNaSessao = new Set()

// A chave carrega o uid: um usuário novo no mesmo navegador precisa ver
// os tutoriais, mesmo que o anterior já os tenha concluído.
function readState(uid) {
  let base = { done: {}, step: 0, current: null }
  const s = readUser(KEY, uid)
  if (s && typeof s === 'object') base = { ...base, ...s }
  // O que a sessão já mostrou vale mesmo que o disco não tenha guardado.
  for (const id of vistoNaSessao) base.done[id] = true
  return base
}
function writeState(uid, s) {
  for (const id of Object.keys(s.done || {})) vistoNaSessao.add(id)
  writeUser(KEY, uid, s)
}
/**
 * Acende UM elemento na tela, fora de qualquer tutorial.
 *
 * É o que a IA usa ao responder "onde eu faço isso": ela navega e pede
 * o destaque do elemento real. Reaproveita a mesma máscara dos
 * tutoriais, então o comportamento é o mesmo que a pessoa já conhece.
 */
export function destacarNoApp({ selector, title, text }) {
  window.dispatchEvent(new CustomEvent('coach:destacar', {
    detail: { selector, title, text },
  }))
}

/** Reabre todos os tutoriais (útil num botão "ver tutorial de novo"). */
export function restartCoachTour(uid) {
  vistoNaSessao.clear()
  writeUser(KEY, uid, { done: {}, step: 0, current: null })
  window.dispatchEvent(new Event('coach:restart'))
}

/** O elemento existe na tela agora? Usado para separar tutoriais que
    dividem a mesma rota - o perfil é a mesma página para cliente e
    veterinário, e só o conteúdo diz de quem ela é. */
const temAlvo = sel => typeof document !== 'undefined' && !!document.querySelector(sel)

/* ── Roteiros ─────────────────────────────────────────────────────
   `primeiro` é o fluxo guiado do primeiro acesso: atravessa páginas e
   exige o toque no elemento certo. Os demais são por aba: destacam os
   elementos e avançam no botão, porque exigir o clique ali levaria a
   pessoa para fora da tela que está sendo explicada.

   Sem tutorial, por decisão de produto: Favoritos (cliente) e
   Solicitações (veterinário). */
const TOURS = {
  primeiro: {
    steps: [
      { id: 'welcome', match: p => p === '/home', center: true,
        title: 'Vamos fazer seu primeiro pedido',
        text: 'Vou te mostrar como pedir um veterinário. É rápido: são só três toques. Você pode pular quando quiser.',
        cta: 'Vamos lá' },
      { id: 'vet-card', match: p => p === '/home', selector: '[data-coach="vet-card"]',
        title: 'Escolha um veterinário',
        text: 'Toque no cartão de um veterinário para ver o perfil dele.',
        hint: 'Toque no cartão destacado' },
      { id: 'request-btn', match: p => p.startsWith('/professional/'), selector: '[data-coach="request-btn"]',
        title: 'Peça o atendimento',
        text: 'Este é o botão que inicia o pedido. Toque nele.',
        hint: 'Toque no botão destacado' },
      { id: 'schedule', match: p => p.startsWith('/professional/'), center: true,
        title: 'Pronto, é só preencher',
        text: 'Agora o app pergunta uma coisa de cada vez: o serviço, o animal, a data e o local. Pode seguir com calma.',
        cta: 'Entendi' },
    ],
  },

  /* ── Cliente ── */
  pedidos: {
    route: p => p === '/my-requests',
    steps: [
      { selector: '[data-coach="req-filters"]', title: 'Filtre pela situação',
        text: 'Veja só os pedidos pendentes, os que estão em andamento ou os já finalizados.' },
      { selector: '[data-coach="req-card"]', title: 'Acompanhe cada pedido',
        text: 'Toque em um pedido para ver os detalhes, conversar com o veterinário e acompanhar o andamento.' },
    ],
  },
  animais: {
    route: p => p === '/pets',
    steps: [
      { selector: '[data-coach="pet-add"]', title: 'Cadastre seus animais',
        text: 'Cadastre uma vez e, na hora de pedir atendimento, é só escolher qual deles.' },
      { selector: '[data-coach="pet-card"]', title: 'Prontuário de cada animal',
        text: 'Toque em um animal para ver e guardar vacinas, exames, consultas e peso.' },
    ],
  },
  perfilCliente: {
    route: p => p === '/edit-profile' && temAlvo('[data-coach="perfil-propriedades"]'),
    steps: [
      { selector: '[data-coach="perfil-dados"]', title: 'Seus dados de contato',
        text: 'O veterinário usa o telefone para te achar na hora do atendimento. Vale conferir se está certo.' },
      { selector: '[data-coach="perfil-animais"]', title: 'Seus animais ficam aqui',
        text: 'Cadastre cada animal uma vez só. Depois, ao pedir atendimento, é só escolher qual deles, e as vacinas e consultas ficam guardadas no prontuário.' },
      { selector: '[data-coach="perfil-propriedades"]', title: 'Onde você quer ser atendido',
        text: 'Cadastre sua casa, sítio ou fazenda e marque o ponto no mapa. Ao agendar, você escolhe para onde o veterinário deve ir e ele chega sem precisar ligar pedindo referência.' },
    ],
  },

  /* ── Veterinário ── */
  painel: {
    route: p => p === '/dashboard',
    steps: [
      { selector: '[data-coach="vet-online"]', title: 'Fique online para receber pedidos',
        text: 'Só quem está online aparece na busca dos clientes. Toque aqui para ligar e desligar.' },
      { selector: '[data-coach="vet-pending"]', title: 'Solicitações esperando você',
        text: 'Os pedidos que precisam da sua resposta aparecem aqui. Aceite ou recuse por esta tela mesmo.' },
    ],
  },
  agenda: {
    route: p => p === '/agenda',
    steps: [
      { selector: '[data-coach="agenda-tabs"]', title: 'Calendário e horários',
        text: 'No Calendário você vê seus atendimentos. Em Disponibilidade você define quando atende.' },
      { selector: '[data-coach="agenda-legend"]', title: 'As cores dos dias',
        text: 'Amarelo é atendimento pendente, azul em andamento e verde já finalizado.' },
    ],
  },
  // Só entra quando a guia Disponibilidade está aberta - por isso
  // depende do elemento estar na tela, não só da rota.
  disponibilidade: {
    route: p => p === '/agenda' && temAlvo('[data-coach="disp-toggle"]'),
    steps: [
      { selector: '[data-coach="disp-toggle"]', title: 'Primeiro, ligue aqui',
        text: 'Enquanto esta chave estiver desligada, o cliente pode pedir qualquer dia e hora. Ligue para escolher quando você atende: o resto da tela só aparece depois disso.' },
      { selector: '[data-coach="disp-duracao"]', title: 'Quanto dura cada atendimento',
        text: 'Se você marcar 60 minutos e atender das 8h às 12h, o cliente vê 8h, 9h, 10h e 11h. É esse intervalo que gera os horários oferecidos.' },
      { selector: '[data-coach="disp-dias"]', title: 'Os dias e as horas',
        text: 'Ligue cada dia que você atende e diga de que horas até que horas. Domingo desligado, por exemplo, some da agenda do cliente.' },
    ],
  },
  perfil: {
    route: p => p === '/edit-profile' && temAlvo('[data-coach="perfil-areas"]'),
    steps: [
      { selector: '[data-coach="perfil-dados"]', title: 'Seus dados de contato',
        text: 'É o que o cliente vê antes de escolher. Foto e telefone certos passam mais confiança.' },
      { selector: '[data-coach="perfil-areas"]', title: 'Suas áreas de atuação',
        text: 'É o que decide quais emergências chegam até você: só as das espécies marcadas aqui.' },
      { selector: '[data-coach="perfil-area-atend"]', title: 'Onde você atende',
        text: 'Marque sua base e o raio que costuma cobrir. O cliente vê a distância até você na busca.' },
    ],
  },
  desempenho: {
    route: p => p === '/reports',
    steps: [
      { selector: '[data-coach="perf-period"]', title: 'Escolha o período',
        text: 'Tudo na tela é recalculado para o período que você escolher aqui.' },
      { selector: '[data-coach="perf-kpis"]', title: 'Seus números',
        text: 'Receita, atendimentos e nota média. A setinha compara com o período anterior.' },
      { selector: '[data-coach="perf-insights"]', title: 'O que isso significa',
        text: 'Aqui os números viram frases simples, dizendo como você está indo e o que melhorar.' },
    ],
  },
}

/* ── Componente ───────────────────────────────────────────────── */
export default function CoachTour() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const uid = user?.uid
  const [state, setState] = useState(() => readState(uid))
  const [rect, setRect] = useState(null)
  const [stuck, setStuck] = useState(false)   // alvo não encontrado a tempo
  const [bubbleH, setBubbleH] = useState(0)   // altura medida do balão
  // Destaque avulso pedido pela IA. Tem prioridade sobre os tutoriais:
  // é resposta direta a algo que a pessoa acabou de perguntar.
  const [destaque, setDestaque] = useState(null)
  const [, setTick] = useState(0)
  const rafRef = useRef(0)
  const bubbleRef = useRef(null)

  useEffect(() => {
    const onRestart = () => setState(readState(uid))
    window.addEventListener('coach:restart', onRestart)
    return () => window.removeEventListener('coach:restart', onRestart)
  }, [uid])

  useEffect(() => {
    const onDestacar = e => {
      const d = e.detail || {}
      if (!d.selector) return
      setDestaque({
        selector: d.selector,
        title: d.title || 'É aqui',
        text: d.text || '',
        cta: 'Entendi',
        avulso: true,
        // Tela em que o destaque vale. Ver o efeito de pathname abaixo.
        rota: window.location.pathname,
      })
    }
    window.addEventListener('coach:destacar', onDestacar)
    return () => window.removeEventListener('coach:destacar', onDestacar)
  }, [])

  // Trocar de tela cancela o destaque: ele aponta um elemento daquela
  // tela e ficaria preso procurando um alvo que não existe mais.
  // Só cancela se a tela for OUTRA: quando a página nova demora a
  // carregar, este efeito rodava depois de o destaque chegar e o apagava.
  useEffect(() => { setDestaque(d => (d && d.rota !== pathname ? null : d)) }, [pathname])

  // Trocou de conta: o espelho em memória era do usuário anterior e
  // esconderia os tutoriais de quem acabou de entrar.
  useEffect(() => {
    vistoNaSessao.clear()
    setState(readState(uid))
  }, [uid])

  /**
   * Reavalia por alguns segundos depois de trocar de tela.
   *
   * Alguns roteiros só sabem se valem para aquela página depois que os
   * dados chegam do Firestore - o perfil, por exemplo, só descobre se é
   * de cliente ou de veterinário ao carregar. Sem esta releitura o
   * tutorial era decidido antes de a página existir e nunca aparecia.
   */
  useEffect(() => {
    let n = 0
    const id = setInterval(() => {
      setTick(t => t + 1)
      if (++n >= 14) clearInterval(id)
    }, 450)
    return () => clearInterval(id)
  }, [pathname])

  /**
   * Qual tutorial roda agora.
   *
   * `done` significa "já foi mostrado", não "foi concluído": um tour é
   * marcado assim que aparece pela primeira vez. Sem isso, quem saísse
   * da tela no meio veria tudo de novo do passo 1 a cada volta.
   *
   * Um tour em andamento continua mesmo já marcado - é o que permite o
   * fluxo do primeiro pedido atravessar Home → perfil → agendamento.
   */
  const tourId = (() => {
    // 1. Continua o que já está rodando, se o passo pertence a esta tela.
    if (state.current) {
      const t = TOURS[state.current]
      const s = t?.steps[state.step]
      if (s && (s.match ? s.match(pathname) : t.route?.(pathname))) return state.current
    }
    // 2. Senão, começa um tour ainda não visto para esta tela.
    //    O fluxo do primeiro pedido tem prioridade sobre os de aba.
    if (!state.done.primeiro && TOURS.primeiro.steps[0].match(pathname)) return 'primeiro'
    for (const [id, t] of Object.entries(TOURS)) {
      if (id === 'primeiro' || state.done[id]) continue
      if (t.route?.(pathname)) return id
    }
    return null
  })()

  const tour = tourId ? TOURS[tourId] : null
  // Trocar de aba reinicia a contagem do passo daquele tour.
  const stepIdx = state.current === tourId ? state.step : 0
  // O destaque avulso substitui o passo do tutorial enquanto durar.
  const step = destaque || tour?.steps[stepIdx] || null
  const active = !!step
  const onRoute = destaque ? true : step ? (step.match ? step.match(pathname) : true) : false
  // "Passo 2 de 3" só faz sentido quando o tour tem mais de um passo.
  const position = !destaque && tour && tour.steps.length > 1
    ? `Passo ${stepIdx + 1} de ${tour.steps.length}`
    : null

  /**
   * Marca o tour como visto assim que ele aparece - não quando termina.
   * Assim, quem sair da tela no meio não vê tudo de novo do passo 1 na
   * próxima visita. O tour em andamento continua normalmente, porque a
   * continuação olha `current`, não `done`.
   */
  useEffect(() => {
    if (destaque || !tourId || state.done[tourId]) return
    // step: 0 é essencial - sem zerar, o tour novo herdaria o passo em
    // que o tour anterior parou e começaria no meio.
    const s = { ...state, done: { ...state.done, [tourId]: true }, current: tourId, step: 0 }
    writeState(uid, s); setState(s)
  }, [tourId, uid])

  function finish() {
    if (destaque) { setDestaque(null); setRect(null); setBubbleH(0); return }
    const s = { ...state, done: { ...state.done, [tourId]: true }, step: 0, current: null }
    writeState(uid, s); setState(s); setRect(null); setBubbleH(0)
  }
  function advance() {
    if (destaque) { setDestaque(null); setRect(null); setBubbleH(0); return }
    const next = stepIdx + 1
    if (!tour || next >= tour.steps.length) return finish()
    const s = { ...state, step: next, current: tourId }
    writeState(uid, s); setState(s); setRect(null); setBubbleH(0)
  }

  /* Mede o balão de verdade em vez de chutar a altura - é o que permite
     garantir que ele cabe na tela junto com o elemento destacado. */
  useLayoutEffect(() => {
    const el = bubbleRef.current
    if (!el) return
    const medir = () => {
      const h = el.getBoundingClientRect().height
      setBubbleH(prev => (Math.abs(prev - h) < 1 ? prev : h))
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [active, onRoute, step?.selector, step?.id, stepIdx, rect === null])

  // Acompanha a posição do alvo (scroll, resize, layout que muda).
  useLayoutEffect(() => {
    if (!active || !onRoute || !step?.selector) { setRect(null); return }

    let cancelled = false
    let rolou = false
    let ajustou = false
    const since = Date.now()
    setStuck(false)

    const tick = () => {
      if (cancelled) return
      const el = document.querySelector(step.selector)
      if (el) {
        const vh = window.innerHeight
        // Espaço que o balão vai ocupar. Antes da medição usa uma
        // estimativa alta - errar para mais só sobra respiro.
        const reserva = (bubbleH || 200) + GAP + SAFE

        if (!rolou) {
          rolou = true
          const r0 = el.getBoundingClientRect()
          const cabe = r0.top > TOP_SAFE && r0.bottom < vh - reserva
          if (!cabe) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }

        const r = el.getBoundingClientRect()

        /* Correção fina, uma vez por passo: se não sobra espaço nem
           acima nem abaixo do elemento, rola de novo mirando a posição
           exata em que os dois cabem. É o caso do celular, onde o alvo
           ficava colado no topo e a explicação saía da tela. */
        if (!ajustou && bubbleH > 0) {
          const sobraAbaixo = vh - Math.min(vh, r.top + r.height) - GAP - SAFE
          const sobraAcima = Math.max(0, r.top) - GAP - SAFE
          if (sobraAbaixo < bubbleH && sobraAcima < bubbleH) {
            ajustou = true
            const visivel = Math.min(r.height, vh - TOP_SAFE - reserva)
            const topoIdeal = Math.max(TOP_SAFE, (vh - reserva - visivel) / 2)
            window.scrollBy({ top: r.top - topoIdeal, behavior: 'smooth' })
          }
        }

        setRect(prev => {
          if (prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5
              && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5) {
            return prev
          }
          return { top: r.top, left: r.left, width: r.width, height: r.height }
        })
      } else {
        setRect(null)
        // Alvo não apareceu: em vez de deixar a pessoa presa sem saber
        // o que fazer, depois de 4s mostramos o balão com um botão.
        if (Date.now() - since > 4000) setStuck(true)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current) }
  }, [active, onRoute, step?.selector, step?.id, bubbleH])

  // Clicar no alvo avança. Captura na fase de captura para registrar
  // o toque mesmo que o app navegue em seguida.
  useEffect(() => {
    if (!active || !onRoute || !step?.selector || !step?.hint) return
    function onClick(e) {
      if (e.target.closest?.(step.selector)) {
        // Deixa o handler da aplicação rodar antes de trocar o passo.
        setTimeout(advance, 60)
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [active, onRoute, step?.selector, step?.id, state?.step])

  if (!active || !onRoute) return null

  // Sem destaque possível (passo centralizado, ou alvo que não apareceu):
  // cai no balão central com botão, para nunca travar o usuário.
  const centered = step.center || !step.selector || (stuck && !rect)
  // Alvo ainda carregando: não bloqueia nada enquanto isso.
  if (!centered && !rect) return null

  const vw = window.innerWidth
  const vh = window.innerHeight

  /* O recorte é limitado à tela. Um elemento que começa acima do topo,
     ou é mais alto que o visível, quebraria a matemática das máscaras e
     não deixaria espaço nenhum para o balão. */
  let box = null
  if (rect) {
    const topo = Math.max(0, rect.top - PAD)
    const base = Math.min(vh, rect.top + rect.height + PAD)
    box = {
      top: topo,
      left: Math.max(0, rect.left - PAD),
      width: Math.min(vw, rect.width + PAD * 2),
      height: Math.max(0, Math.min(base - topo, vh * 0.55)),
    }
  }

  /* Onde o balão cabe inteiro. Enquanto não foi medido, entra
     transparente: aparecer no lugar errado e pular depois é pior do que
     surgir 1 quadro mais tarde já no lugar certo. */
  const largura = Math.min(vw - SAFE * 2, BUBBLE_MAX)
  let bubbleStyle = null
  if (box) {
    const sobraAbaixo = vh - (box.top + box.height) - GAP - SAFE
    const sobraAcima = box.top - GAP - SAFE
    const h = bubbleH
    let top
    if (!h) top = box.top + box.height + GAP                 // ainda medindo
    else if (sobraAbaixo >= h) top = box.top + box.height + GAP
    else if (sobraAcima >= h) top = box.top - GAP - h
    else if (sobraAbaixo >= sobraAcima) top = vh - SAFE - h   // encosta embaixo
    else top = SAFE                                          // encosta em cima

    bubbleStyle = {
      top: Math.max(SAFE, Math.min(top, vh - SAFE - h)),
      left: Math.max(SAFE, Math.min(box.left + box.width / 2 - largura / 2, vw - SAFE - largura)),
      width: largura,
      opacity: h ? 1 : 0,
    }
  }

  return (
    // O container precisa ser pointer-events-none: uma div de tela cheia
    // captura o clique mesmo sendo transparente, e isso impediria o toque
    // de chegar ao elemento destacado. Quem bloqueia são só as máscaras.
    <div className="fixed inset-0 z-[80] pointer-events-none" aria-live="polite">
      {centered ? (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center px-4 pointer-events-auto">
          <div ref={bubbleRef} className="w-full" style={{ maxWidth: BUBBLE_MAX }}>
            <Bubble step={step} onCta={advance} onSkip={finish} forceCta={stuck} position={position} />
          </div>
        </div>
      ) : (
        <>
          {/* Máscara em 4 partes: tudo fora do recorte fica bloqueado */}
          <div className="absolute left-0 right-0 top-0 bg-black/70 pointer-events-auto"
               style={{ height: Math.max(0, box.top) }} />
          <div className="absolute left-0 right-0 bottom-0 bg-black/70 pointer-events-auto"
               style={{ top: box.top + box.height }} />
          <div className="absolute left-0 bg-black/70 pointer-events-auto"
               style={{ top: box.top, height: box.height, width: Math.max(0, box.left) }} />
          <div className="absolute right-0 bg-black/70 pointer-events-auto"
               style={{ top: box.top, height: box.height, left: box.left + box.width }} />

          {/* Anel de destaque - não intercepta o toque */}
          <div className="absolute pointer-events-none ring-4 ring-primary/90 animate-pulse"
               style={{ top: box.top, left: box.left, width: box.width, height: box.height, borderRadius: RADIUS }} />

          {/* Balão */}
          <div ref={bubbleRef}
               className="absolute pointer-events-auto transition-opacity duration-150"
               style={bubbleStyle}>
            <Bubble step={step} onCta={advance} onSkip={finish} position={position} />
          </div>
        </>
      )}
    </div>
  )
}

/* ── Balão de instrução ───────────────────────────────────────── */
function Bubble({ step, onCta, onSkip, forceCta, position }) {
  // Passo com `hint` avança pelo toque no elemento (fluxo guiado).
  // Os demais avançam por botão - exigir o clique num tour de aba
  // levaria a pessoa para fora da tela que está sendo explicada.
  const cta = step.cta || (step.hint && !forceCta ? null : 'Continuar')
  return (
    <div className="bg-white rounded-3xl shadow-2xl p-5 flex flex-col gap-3 animate-scale-in"
         role="dialog" aria-modal="true">
      <div>
        {position && (
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">
            {position}
          </p>
        )}
        <h2 className="text-lg font-bold text-gray-900 leading-snug">{step.title}</h2>
        <p className="text-sm text-gray-600 leading-relaxed mt-1">{step.text}</p>
      </div>

      <div className="flex items-center gap-2">
        {cta ? (
          <button onClick={onCta} className="btn-primary flex-1">{cta}</button>
        ) : (
          <p className="flex-1 text-xs font-bold text-primary flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            {step.hint}
          </p>
        )}
        <button onClick={onSkip} className="btn-ghost btn-sm flex-shrink-0">
          Pular
        </button>
      </div>
    </div>
  )
}
