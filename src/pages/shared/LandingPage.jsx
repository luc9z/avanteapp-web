/**
 * /conheca - apresentação do AVANTE para quem chega de fora.
 *
 * É o destino do link da bio, dos vídeos e dos links de indicação. Fala
 * primeiro com o veterinário: marketplace sem profissional não serve ao
 * tutor, então a oferta vem antes da procura.
 *
 * Cara única, verde da marca, como os posts do Instagram. Usa cores
 * fixas (bg-[#...]) de propósito: o tema escuro do app remapeia
 * bg-white, text-gray-* e bg-primary com !important, e a página de
 * apresentação não pode mudar de cara conforme o tema de quem abre.
 *
 * Só promete o que o app faz hoje. Nenhum número, nenhum depoimento
 * inventado.
 */
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { marcarIntencao } from '../../services/origem'
import AvanteLogo from '../../components/common/AvanteLogo'

const C = {
  fundo: 'bg-[#0c1a10]',
  faixa: 'bg-[#10241a]',
  cartao: 'bg-[#142c1d] border border-[#1f3d29]',
  texto: 'text-[#ecf5ee]',
  suave: 'text-[#a3b8a8]',
  acento: 'text-[#86efac]',
}

function Icone({ d }) {
  return (
    <div className="w-11 h-11 rounded-xl bg-[#1c3a26] flex items-center justify-center flex-shrink-0">
      <svg className="w-5 h-5 text-[#86efac]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
    </div>
  )
}

const PASSOS = [
  {
    titulo: 'Cadastro com CRMV',
    texto: 'Informe seu CRMV e as espécies que você atende: pets, equinos, bovinos e outros.',
  },
  {
    titulo: 'Pedidos da sua região',
    texto: 'Os pedidos de quem está perto chegam pelo app. Você aceita ou recusa, sem obrigação.',
  },
  {
    titulo: 'Orçamento e atendimento',
    texto: 'Você envia o orçamento, o cliente aprova antes da visita e você vai atender.',
  },
]

const RECURSOS = [
  { titulo: 'Chat direto com o tutor', texto: 'Combine horário, endereço e detalhes pelo próprio app.',
    d: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
  { titulo: 'Orçamento aprovado antes', texto: 'O cliente aprova o valor no app antes de você sair de casa.',
    d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { titulo: 'Receita digital', texto: 'Emita a receita pelo app ao terminar o atendimento.',
    d: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  { titulo: 'Agenda e horários', texto: 'Defina quando atende. O cliente só agenda nos horários livres.',
    d: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { titulo: 'Prontuário do animal', texto: 'Histórico de cada paciente guardado e fácil de consultar.',
    d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { titulo: 'Emergências na sua área', texto: 'Chamados urgentes chegam para quem atende aquela espécie.',
    d: 'M13 10V3L4 14h7v7l9-11h-7z' },
]

/** Ilustração do app: um pedido chegando. Não é dado real, é desenho da tela. */
function TelaDoPedido() {
  return (
    <div className="relative mx-auto w-full max-w-[300px]" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[44px] bg-[#4ade80]/10 blur-2xl" />
      <div className="relative rounded-[30px] border border-[#24452f] bg-[#0f1511] p-3.5 shadow-2xl">
        <div className="flex items-center justify-between px-1 pb-3">
          <span className="text-[11px] font-semibold text-[#86efac]">Novo pedido</span>
          <span className="text-[11px] text-[#6f8a76]">agora</span>
        </div>

        <div className="rounded-2xl bg-[#1a221c] p-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#2a3f2a] flex items-center justify-center text-sm font-bold text-[#ecf5ee]">M</div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#ecf5ee]">Vacinação</p>
              <p className="text-xs text-[#a3b8a8]">Cão, 4 anos · 2,6 km de você</p>
            </div>
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[#3a4a3e] py-2 text-center text-xs font-semibold text-[#a3b8a8]">Recusar</div>
            <div className="rounded-xl bg-[#4ade80] py-2 text-center text-xs font-bold text-[#062012]">Aceitar</div>
          </div>
        </div>

        <div className="mt-2.5 rounded-2xl bg-[#1a221c] px-3.5 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-[#6f8a76]">Orçamento</p>
            <p className="text-sm font-bold text-[#ecf5ee]">Aprovado pelo cliente</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#4ade80]/15 flex items-center justify-center">
            <svg className="w-4 h-4 text-[#86efac]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <div className="mt-2.5 rounded-2xl bg-[#1a221c] px-3.5 py-3 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse" />
          <p className="text-xs text-[#a3b8a8]">O cliente acompanha você a caminho</p>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const antes = document.title
    document.title = 'AVANTE | Veterinário a domicílio'
    return () => { document.title = antes }
  }, [])

  /** Guarda qual público clicou e leva para o cadastro. */
  function comecar(intencao) {
    if (user) return navigate('/')
    marcarIntencao(intencao)
    navigate('/register')
  }

  const btnPrincipal = `inline-flex items-center justify-center gap-2 rounded-2xl bg-[#4ade80] px-6 min-h-[52px]
    text-[15px] font-bold text-[#062012] transition-all hover:bg-[#6ee7a0] active:scale-[0.98]
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#86efac] focus-visible:ring-offset-2
    focus-visible:ring-offset-[#0c1a10]`
  const btnSecundario = `inline-flex items-center justify-center gap-2 rounded-2xl border border-[#2f5a3b] px-6 min-h-[52px]
    text-[15px] font-semibold text-[#ecf5ee] transition-all hover:bg-[#16301f] active:scale-[0.98]
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#86efac]`

  return (
    <div className={`min-h-screen ${C.fundo} ${C.texto} antialiased`}>

      {/* ── Topo ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0c1a10]/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link to="/conheca" className="flex min-h-[44px] items-center gap-2">
            <AvanteLogo variant="horizontal-sem-slogan" className="h-8 text-brand-creme" />
          </Link>
          <Link to={user ? '/' : '/login'}
            className="inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm font-semibold text-[#86efac] hover:bg-white/5">
            {user ? 'Abrir o app' : 'Entrar'}
          </Link>
        </div>
      </header>

      {/* ── Abertura ─────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 sm:px-8 sm:pt-16 md:grid-cols-[1.15fr_0.85fr] md:pb-24">
        <div>
          <p className={`text-xs font-bold uppercase tracking-[0.18em] ${C.acento}`}>Para veterinários</p>
          <h1 className="mt-4 text-[34px] font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[56px]">
            Os atendimentos a domicílio chegam até você.
          </h1>
          <p className={`mt-5 max-w-xl text-base leading-relaxed sm:text-lg ${C.suave}`}>
            O AVANTE conecta você a tutores e produtores rurais da sua região que precisam de um
            veterinário. O pedido chega pelo app, você decide se aceita e combina tudo por ali.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button onClick={() => comecar('vet')} className={btnPrincipal}>
              Quero atender pelo AVANTE
            </button>
            <button onClick={() => comecar('tutor')} className={btnSecundario}>
              Preciso de um veterinário
            </button>
          </div>
          <p className="mt-4 text-sm text-[#6f8a76]">Grátis para começar. O plano Free já recebe pedidos.</p>
        </div>

        <TelaDoPedido />
      </section>

      {/* ── Como funciona ────────────────────────────────── */}
      <section className={C.faixa}>
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Como funciona</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {PASSOS.map((p, i) => (
              <li key={p.titulo} className={`rounded-2xl p-6 ${C.cartao}`}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4ade80] text-sm font-bold text-[#062012]">
                  {i + 1}
                </span>
                <p className="mt-4 text-lg font-bold">{p.titulo}</p>
                <p className={`mt-1.5 text-sm leading-relaxed ${C.suave}`}>{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── O que vem no app ─────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Tudo do atendimento num lugar só</h2>
        <p className={`mt-2 max-w-xl ${C.suave}`}>Do primeiro contato à receita, sem planilha e sem conversa perdida no WhatsApp.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RECURSOS.map(r => (
            <div key={r.titulo} className={`flex gap-4 rounded-2xl p-5 ${C.cartao}`}>
              <Icone d={r.d} />
              <div>
                <p className="font-bold">{r.titulo}</p>
                <p className={`mt-1 text-sm leading-relaxed ${C.suave}`}>{r.texto}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Recém-formado ────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 sm:pb-20">
        <div className="grid items-center gap-8 overflow-hidden rounded-3xl bg-[#375337] p-7 sm:p-10 md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#bbf7d0]">Recém-formado?</p>
            <h2 className="mt-3 text-2xl font-bold leading-tight sm:text-4xl">
              Comece a atender sem carteira de clientes e sem consultório.
            </h2>
            <p className="mt-4 max-w-lg leading-relaxed text-[#d7e8da]">
              Quem precisa de veterinário perto de você já está procurando. Você só escolhe quais
              pedidos aceitar.
            </p>
            <button onClick={() => comecar('vet')} className={`${btnPrincipal} mt-7`}>
              Criar minha conta
            </button>
          </div>
          <div className="mx-auto w-full max-w-[280px] rounded-[28px] bg-[#e9f2e6] p-4">
            <img src="/images/escolha-veterinario.png" alt="" className="w-full" loading="lazy" />
          </div>
        </div>
      </section>

      {/* ── Para tutores e produtores ────────────────────── */}
      <section className={C.faixa}>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-20 md:grid-cols-[0.8fr_1.2fr]">
          <div className="order-2 mx-auto w-full max-w-[300px] rounded-[28px] bg-[#e9f2e6] p-4 md:order-1">
            <img src="/images/escolha-tutor.png" alt="" className="w-full" loading="lazy" />
          </div>
          <div className="order-1 md:order-2">
            <p className={`text-xs font-bold uppercase tracking-[0.18em] ${C.acento}`}>Para tutores e produtores</p>
            <h2 className="mt-3 text-2xl font-bold leading-tight sm:text-4xl">
              Precisa de um veterinário em casa ou na fazenda?
            </h2>
            <ul className={`mt-5 flex flex-col gap-2.5 ${C.suave}`}>
              {[
                'Veja quem atende perto de você e está online agora',
                'Peça o atendimento e aprove o orçamento antes da visita',
                'Acompanhe o veterinário a caminho em tempo real',
              ].map(t => (
                <li key={t} className="flex items-start gap-2.5">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#86efac]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <button onClick={() => comecar('tutor')} className={`${btnSecundario} mt-7`}>
              Encontrar um veterinário
            </button>
          </div>
        </div>
      </section>

      {/* ── Rodapé ───────────────────────────────────────── */}
      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-[#6f8a76] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>AVANTE · Atendimento veterinário a domicílio</p>
          <nav className="flex flex-wrap gap-x-5 [&>*]:inline-flex [&>*]:min-h-[44px] [&>*]:items-center">
            <a href="https://instagram.com/avante_gps" target="_blank" rel="noopener noreferrer" className="hover:text-[#ecf5ee]">
              Instagram
            </a>
            <Link to="/terms" className="hover:text-[#ecf5ee]">Termos de uso</Link>
            <Link to="/privacy" className="hover:text-[#ecf5ee]">Privacidade</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
