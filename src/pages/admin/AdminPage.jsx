/**
 * AdminPage - painel do dono do app (/admin).
 *
 * Acesso: apenas usuários com documento em admins/{uid}, criado
 * manualmente no console do Firebase. A tela de acesso negado mostra o
 * identificador da própria sessão (sem ele não há como cadastrar o
 * primeiro admin) mas não explica o procedimento.
 *
 * Abas:
 *  - Visão geral: saúde da plataforma em tempo real e o que precisa de
 *    atenção agora.
 *  - Usuários: busca, filtros, inspeção, plano, desativar e excluir.
 *  - Solicitações: moderação dos atendimentos (ver, destravar, apagar).
 *  - Ofertas: anúncios exibidos no app (coleção offers).
 *  - Planos: valores e benefícios (config/plans), usados na página de
 *    planos do veterinário e no checkout AbacatePay.
 *
 * Nenhum aviso usa `alert()`/`confirm()`: erros saem em toast e as
 * confirmações destrutivas passam pelo ConfirmDialog, que exige digitar
 * a palavra antes de apagar.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  doc, getDoc, setDoc, collection, onSnapshot, addDoc, updateDoc,
  deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import Modal from '../../components/common/Modal'
import { HBarList } from '../../components/common/Charts'
import { showToast } from '../../components/common/Toast'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import { friendlyError } from '../../utils/errors'
import { normalizeStatus, statusInfo } from '../../utils/status'
import { contarVinculos, excluirConta } from '../../services/deleteAccount'

/* ── Ofertas pré-moldadas (edite à vontade depois de inserir) ──── */
const OFFER_TEMPLATES = [
  // ── Para CLIENTES ──
  {
    emoji: '🦴', title: 'Ração premium com 15% OFF',
    subtitle: 'Para cães e gatos · entrega na sua região',
    cta: 'Aproveitar', url: 'https://', active: false, order: 1,
    size: 'small', audience: 'client', gradient: 'amber',
  },
  {
    emoji: '💉', title: 'Campanha de vacinação',
    subtitle: 'Agende a vacina anual do seu pet com desconto',
    cta: 'Saber mais', url: 'https://', active: false, order: 2,
    size: 'large', audience: 'client', gradient: 'green',
  },
  {
    emoji: '🛒', title: 'Pet shop com frete grátis',
    subtitle: 'Brinquedos, camas e acessórios para o seu pet',
    cta: 'Ver loja', url: 'https://', active: false, order: 3,
    size: 'small', audience: 'client', gradient: 'purple',
  },
  // ── Para VETERINÁRIOS ──
  {
    emoji: '💊', title: 'Distribuidora de medicamentos veterinários',
    subtitle: 'Condições especiais para profissionais cadastrados',
    cta: 'Cadastrar', url: 'https://', active: false, order: 4,
    size: 'large', audience: 'vet', gradient: 'blue',
  },
  {
    emoji: '🩺', title: 'Equipamentos e instrumentais',
    subtitle: 'Monte seu kit de atendimento a domicílio',
    cta: 'Ver catálogo', url: 'https://', active: false, order: 5,
    size: 'small', audience: 'vet', gradient: 'teal',
  },
  {
    emoji: '🎓', title: 'Cursos de especialização',
    subtitle: 'Atualize-se e atraia mais clientes',
    cta: 'Conhecer', url: 'https://', active: false, order: 6,
    size: 'small', audience: 'vet', gradient: 'red',
  },
]

/* ── Planos padrão (valores fictícios - ajuste na própria tela) ── */
export const DEFAULT_PLANS = [
  {
    id: 'free', name: 'Free', price: 0, billing: 'mensal',
    benefits: [
      'Perfil visível na busca',
      'Receber e aceitar solicitações',
      'Chat com clientes',
      'Agenda de atendimentos',
    ],
    locked: [
      'Sem anúncios no painel',
      'Selo de Destaque na busca',
      'Topo dos resultados da busca',
    ],
  },
  {
    id: 'essencial', name: 'Essencial', price: 29.9, billing: 'mensal',
    benefits: [
      'Tudo do plano Free',
      'Sem anúncios no painel',
      'Relatórios completos do mês',
      'Histórico de atendimentos',
    ],
    locked: [
      'Selo de Destaque na busca',
      'Topo dos resultados da busca',
    ],
  },
  {
    id: 'premium', name: 'Premium', price: 59.9, billing: 'mensal',
    benefits: [
      'Tudo do plano Essencial',
      'Selo dourado de Destaque',
      'Topo dos resultados da busca',
      'Prioridade nas solicitações',
    ],
    locked: [],
  },
]

const EMPTY_OFFER = { emoji: '🐾', title: '', subtitle: '', cta: 'Ver oferta', url: 'https://', active: false, order: 9, size: 'small', audience: 'all', gradient: 'amber' }

/* ── Helpers compartilhados ─────────────────────────────────────── */
const money = n => `R$ ${(Number(n) || 0).toFixed(2).replace('.', ',')}`
// O cadastro grava 'medico_veterinario' (ConfirmDataPage); 'vet' e
// 'professional' ficam só por compatibilidade com contas antigas.
const PROFISSOES_VET = ['medico_veterinario', 'vet', 'professional']
const isVet = u => PROFISSOES_VET.includes(u.profession) || !!u.council
const planoDe = u => (['premium', 'destaque'].includes(u.plan) ? 'premium' : u.plan === 'essencial' ? 'essencial' : 'free')
const quando = ts => {
  const d = ts?.toDate?.()
  return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'
}

/** Copia para a área de transferência avisando por toast nos dois casos. */
function copiar(texto, oque = 'Valor') {
  navigator.clipboard?.writeText(texto || '')
    .then(() => showToast(`${oque} copiado.`, 'success'))
    .catch(() => showToast('Não foi possível copiar. Selecione e copie manualmente.', 'info'))
}

/**
 * Baixa uma tabela como CSV. Usa ponto e vírgula porque é o separador
 * que o Excel em português entende sem pedir importação.
 */
function baixarCSV(nome, colunas, linhas) {
  const escapa = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [colunas.map(escapa).join(';'), ...linhas.map(l => l.map(escapa).join(';'))].join('\n')
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${nome}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  showToast(`${linhas.length} registro(s) exportado(s).`, 'success')
}

const TABS = [
  ['visao', 'Visão geral'],
  ['usuarios', 'Usuários'],
  ['solicitacoes', 'Solicitações'],
  ['ofertas', 'Ofertas'],
  ['planos', 'Planos'],
]

export default function AdminPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin] = useState(null)
  const [tab, setTab] = useState('visao')
  // Filtro que a Visão geral manda para a aba de Usuários ao clicar num
  // atalho ("2 contas desativadas" abre a lista já filtrada).
  const [filtroInicial, setFiltroInicial] = useState(null)

  useEffect(() => {
    if (!user?.uid) return
    getDoc(doc(db, 'admins', user.uid))
      .then(snap => {
        setIsAdmin(snap.exists())
        // Sem isto era impossível cadastrar o primeiro admin: o uid só
        // aparecia dentro do painel, que já exigia ser admin.
        if (!snap.exists()) console.info('[admin] seu uid:', user.uid)
      })
      .catch(e => {
        // permission-denied normalmente significa firestore.rules desatualizado.
        console.error('[admin] verificação de acesso falhou:', e?.code, 'uid:', user.uid)
        setIsAdmin(false)
      })
  }, [user?.uid])

  function irPara(destino, filtro = null) {
    setFiltroInicial(filtro)
    setTab(destino)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (isAdmin === null) {
    return <div className="flex justify-center items-center min-h-screen"><Spinner size={32} color="#375337" /></div>
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center gap-3">
        <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <p className="font-bold text-gray-800">Área restrita</p>
        <p className="text-sm text-gray-500 max-w-sm">
          Você não tem permissão para acessar esta página.
        </p>

        {/* O identificador da própria sessão. Não é segredo - é o id de
            quem já está logado, e sem ele não há como cadastrar o
            primeiro administrador. A tela continua sem explicar o
            procedimento: quem precisa, sabe o que fazer com o valor. */}
        <div className="flex flex-col items-center gap-1.5 mt-1">
          <p className="text-[11px] text-gray-400 uppercase tracking-wide">Seu identificador</p>
          <button
            onClick={() => copiar(user?.uid, 'Identificador')}
            className="font-mono text-xs text-gray-600 bg-gray-100 rounded-lg px-3 py-2
                       break-all select-all max-w-xs hover:bg-gray-200 transition-colors"
            title="Copiar"
          >
            {user?.uid}
          </button>
        </div>

        <button onClick={() => navigate('/')} className="btn-primary px-6 mt-2">Voltar</button>
      </div>
    )
  }

  return (
    <div className="page-container largura-painel pb-10">
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary" aria-label="Voltar">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="page-title">Administração</h1>
        <div className="w-6" />
      </div>

      {/* Abas - grudam abaixo da topbar para não sumirem em listas longas */}
      <div className="sticky top-[57px] z-20 bg-gray-100 px-4 py-3">
        <div className="flex bg-white rounded-2xl p-1 gap-1 overflow-x-auto shadow-sm">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => irPara(id)}
              className={`flex-1 min-w-max px-3 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                tab === id ? 'bg-primary text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'visao'        && <OverviewTab onGo={irPara} />}
      {tab === 'usuarios'     && <UsersTab filtroInicial={filtroInicial} />}
      {tab === 'solicitacoes' && <RequestsTab filtroInicial={filtroInicial} />}
      {tab === 'ofertas'      && <OffersTab />}
      {tab === 'planos'       && <PlansTab />}

      {/* Seu uid - aqui é seguro, a tela já exige ser admin. */}
      <div className="px-4 pb-6 pt-2">
        <p className="text-[11px] text-gray-400">Seu ID de administrador</p>
        <button onClick={() => copiar(user?.uid, 'Identificador')}
          className="text-xs text-gray-500 font-mono break-all text-left hover:text-primary transition-colors">
          {user?.uid}
        </button>
      </div>
    </div>
  )
}

/* ════════════════ ABA VISÃO GERAL ════════════════
   Saúde da plataforma em tempo real: quem está usando, quanto está
   circulando e - principalmente - o que precisa de atenção agora. */
function OverviewTab({ onGo }) {
  const [users, setUsers] = useState(null)
  const [requests, setRequests] = useState(null)

  useEffect(() => {
    const unsubU = onSnapshot(collection(db, 'users'),
      snap => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => { console.error('[admin] users:', e); showToast(friendlyError(e, 'Não foi possível carregar os usuários.'), 'error'); setUsers([]) })
    const unsubR = onSnapshot(collection(db, 'requests'),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => { console.error('[admin] requests:', e); showToast(friendlyError(e, 'Não foi possível carregar as solicitações.'), 'error'); setRequests([]) })
    return () => { unsubU(); unsubR() }
  }, [])

  const m = useMemo(() => {
    if (!users || !requests) return null
    const vets = users.filter(isVet)
    const clients = users.filter(u => u.profession === 'client')
    const online = vets.filter(v => v.is_online === true)
    const byPlan = { free: 0, essencial: 0, premium: 0 }
    for (const v of vets) byPlan[planoDe(v)]++

    const st = r => normalizeStatus(r.status)
    const finalizados = requests.filter(r => st(r) === 'finalizado')
    const pendentes = requests.filter(r => st(r) === 'pendente')
    const urgentes = requests.filter(r => st(r) === 'urgente')
    const emAndamento = requests.filter(r => ['aceito', 'a_caminho', 'em_andamento', 'orcamento'].includes(st(r)))
    const gmv = finalizados.reduce((s, r) => s + (r.quote?.approvedAt ? Number(r.quote?.total) || 0 : 0), 0)
    const mrr = byPlan.essencial * 29.9 + byPlan.premium * 59.9

    const desde = dias => new Date(Date.now() - dias * 864e5)
    const criadoApos = (x, d) => (x.createdAt?.toDate?.() || null) >= d
    const novos30 = users.filter(u => criadoApos(u, desde(30))).length
    const novos7 = users.filter(u => criadoApos(u, desde(7))).length
    const pedidos7 = requests.filter(r => criadoApos(r, desde(7))).length

    // Pontos de atenção: o que o dono do app precisa resolver hoje.
    const alertas = []
    if (urgentes.length) {
      alertas.push({
        tom: 'red', titulo: `${urgentes.length} emergência${urgentes.length === 1 ? '' : 's'} sem veterinário`,
        texto: 'Nenhum profissional aceitou ainda. Confira se há vets online com a área de atuação correspondente.',
        acao: 'Ver solicitações', ir: () => onGo('solicitacoes', 'urgente'),
      })
    }
    if (!online.length && vets.length) {
      alertas.push({
        tom: 'amber', titulo: 'Nenhum veterinário online',
        texto: 'Com todos offline, a busca do cliente aparece vazia e nenhuma emergência é entregue.',
        acao: 'Ver veterinários', ir: () => onGo('usuarios', 'vets'),
      })
    }
    const semArea = vets.filter(v => !Array.isArray(v.specialties) || v.specialties.length === 0)
    if (semArea.length) {
      alertas.push({
        tom: 'amber', titulo: `${semArea.length} veterinário(s) sem área de atuação`,
        texto: 'Emergências são filtradas por espécie: quem não marcou nenhuma área não recebe chamado nenhum.',
        acao: 'Ver veterinários', ir: () => onGo('usuarios', 'vets'),
      })
    }
    const desativados = users.filter(u => u.disabled)
    if (desativados.length) {
      alertas.push({
        tom: 'gray', titulo: `${desativados.length} conta(s) desativada(s)`,
        texto: 'Essas pessoas não conseguem acessar o app. Reative pela ficha do usuário quando fizer sentido.',
        acao: 'Ver contas', ir: () => onGo('usuarios', 'desativados'),
      })
    }
    if (pendentes.length >= 5) {
      alertas.push({
        tom: 'amber', titulo: `${pendentes.length} solicitações pendentes`,
        texto: 'Pedidos esperando resposta de um profissional há mais tempo que o normal.',
        acao: 'Ver solicitações', ir: () => onGo('solicitacoes', 'pendente'),
      })
    }

    // Cidades com mais gente - orienta onde vale divulgar.
    const cidades = {}
    for (const u of users) {
      const c = (u.city || '').trim()
      if (c) cidades[c] = (cidades[c] || 0) + 1
    }
    const topCidades = Object.entries(cidades)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([label, value]) => ({ label, value }))

    const conversao = requests.length ? Math.round((finalizados.length / requests.length) * 100) : 0
    const ticket = finalizados.length ? gmv / finalizados.length : 0

    return {
      total: users.length, vets: vets.length, clients: clients.length,
      online: online.length, byPlan, reqs: requests.length,
      finalizados: finalizados.length, pendentes: pendentes.length,
      urgentes: urgentes.length, emAndamento: emAndamento.length,
      gmv, mrr, novos30, novos7, pedidos7, alertas, topCidades, conversao, ticket,
    }
  }, [users, requests, onGo])

  if (!m) return <div className="flex justify-center py-20"><Spinner size={28} color="#375337" /></div>

  return (
    <div className="px-4 pb-4 flex flex-col gap-5">
      {/* Resumo do momento */}
      <div className="rounded-3xl bg-primary text-white px-5 py-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">Agora na plataforma</p>
        <div className="flex items-end gap-6 mt-2">
          <div>
            <p className="text-3xl font-black leading-none">{m.online}</p>
            <p className="text-xs text-white/70 mt-1">vets online</p>
          </div>
          <div>
            <p className="text-3xl font-black leading-none">{m.emAndamento}</p>
            <p className="text-xs text-white/70 mt-1">atendimentos ativos</p>
          </div>
          <div>
            <p className="text-3xl font-black leading-none">{m.pedidos7}</p>
            <p className="text-xs text-white/70 mt-1">pedidos em 7 dias</p>
          </div>
        </div>
      </div>

      {/* Precisa de atenção */}
      {m.alertas.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="section-title !mb-0">Precisa de atenção</p>
          {m.alertas.map((a, i) => <Alerta key={i} {...a} />)}
        </div>
      )}

      <div>
        <p className="section-title !mb-2">Pessoas</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <AdminStat value={m.total} label="Usuários" hint={`+${m.novos30} em 30 dias`} onClick={() => onGo('usuarios')} />
          <AdminStat value={m.vets} label="Veterinários" hint={`${m.online} online agora`} accent="text-primary" onClick={() => onGo('usuarios', 'vets')} />
          <AdminStat value={m.clients} label="Clientes" hint="tutores e produtores" accent="text-blue-600" onClick={() => onGo('usuarios', 'clientes')} />
          <AdminStat value={m.novos7} label="Novos" hint="últimos 7 dias" accent="text-green-600" />
        </div>
      </div>

      <div>
        <p className="section-title !mb-2">Receita</p>
        <div className="grid grid-cols-2 gap-3">
          <AdminStat value={money(m.mrr)} label="Receita recorrente" hint="assinaturas ativas/mês" accent="text-primary" />
          <AdminStat value={money(m.gmv)} label="Volume transacionado" hint="orçamentos aprovados" accent="text-amber-600" />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <AdminStat value={money(m.ticket)} label="Ticket médio" hint="por atendimento concluído" />
          <AdminStat value={`${m.conversao}%`} label="Taxa de conclusão" hint="pedidos que viram atendimento" />
        </div>
        <div className="card mt-3">
          <p className="card-title mb-3">Assinantes por plano</p>
          <HBarList data={[
            { label: 'Free', value: m.byPlan.free },
            { label: 'Essencial', value: m.byPlan.essencial },
            { label: 'Premium', value: m.byPlan.premium },
          ]} />
        </div>
      </div>

      <div>
        <p className="section-title !mb-2">Atendimentos</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <AdminStat value={m.reqs} label="Solicitações" hint="total histórico" onClick={() => onGo('solicitacoes')} />
          <AdminStat value={m.finalizados} label="Concluídos" accent="text-primary"
            hint={m.reqs ? `${m.conversao}% do total` : '-'} onClick={() => onGo('solicitacoes', 'finalizado')} />
          <AdminStat value={m.pendentes} label="Pendentes" hint="aguardando vet" accent="text-amber-600" onClick={() => onGo('solicitacoes', 'pendente')} />
          <AdminStat value={m.urgentes} label="Emergências" hint="em aberto" accent="text-red-500" onClick={() => onGo('solicitacoes', 'urgente')} />
        </div>
      </div>

      {m.topCidades.length > 0 && (
        <div className="card">
          <p className="card-title mb-3">Onde está sua base</p>
          <HBarList data={m.topCidades} />
          <p className="text-[11px] text-gray-400 mt-3">
            Cidades com mais cadastros. Serve para decidir onde vale anunciar e onde falta veterinário.
          </p>
        </div>
      )}
    </div>
  )
}

/** Cartão de alerta com uma ação direta - não só o aviso. */
function Alerta({ tom, titulo, texto, acao, ir }) {
  const cores = {
    red: 'border-red-400 bg-red-50/60',
    amber: 'border-amber-400 bg-amber-50/60',
    gray: 'border-gray-300 bg-gray-50',
  }
  const textos = { red: 'text-red-700', amber: 'text-amber-700', gray: 'text-gray-700' }
  return (
    <div className={`card border-l-4 ${cores[tom] || cores.gray} flex flex-col gap-1.5`}>
      <p className={`text-sm font-bold ${textos[tom] || textos.gray}`}>{titulo}</p>
      <p className="text-xs text-gray-500 leading-relaxed">{texto}</p>
      {acao && (
        <button onClick={ir} className="btn-ghost btn-sm self-start !px-0 !text-primary">
          {acao}
        </button>
      )}
    </div>
  )
}

function AdminStat({ value, label, hint, accent = 'text-gray-900', onClick }) {
  const conteudo = (
    <>
      <p className={`stat-value ${accent}`}>{value}</p>
      <p className="stat-label">{label}</p>
      {hint && <p className="stat-hint">{hint}</p>}
    </>
  )
  if (!onClick) return <div className="stat-tile">{conteudo}</div>
  return (
    <button onClick={onClick} className="stat-tile text-left hover:shadow-card-hover hover:-translate-y-px transition-all">
      {conteudo}
    </button>
  )
}

/* ════════════════ ABA USUÁRIOS ════════════════
   Busca, filtros e ficha completa. Dados sensíveis (CPF/telefone)
   continuam fora daqui: vivem em users/{uid}/private. */
const PAGINA = 30

function UsersTab({ filtroInicial }) {
  const [users, setUsers] = useState(null)
  const [q, setQ] = useState('')
  const [role, setRole] = useState(filtroInicial === 'vets' || filtroInicial === 'clientes' ? filtroInicial : 'todos')
  const [plano, setPlano] = useState('todos')
  const [situacao, setSituacao] = useState(filtroInicial === 'desativados' ? 'desativados' : 'todos')
  const [ordem, setOrdem] = useState('recentes')
  const [limite, setLimite] = useState(PAGINA)
  const [detail, setDetail] = useState(null)
  const [removing, setRemoving] = useState(false)
  const [progresso, setProgresso] = useState('')
  // Última etapa da exclusão - sobrevive ao throw e diz onde parou.
  const etapaRef = useRef('')

  useEffect(() => {
    return onSnapshot(collection(db, 'users'),
      snap => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => {
        console.error('[admin] users:', e)
        showToast(friendlyError(e, 'Não foi possível carregar os usuários.'), 'error')
        setUsers([])
      })
  }, [])

  // Mudar de filtro volta para a primeira página - senão a lista abre no
  // meio e parece que faltam resultados.
  useEffect(() => { setLimite(PAGINA) }, [q, role, plano, situacao, ordem])

  const filtrados = useMemo(() => {
    if (!users) return []
    const term = q.trim().toLowerCase()
    const lista = users.filter(u => {
      const vet = isVet(u)
      if (role === 'vets' && !vet) return false
      if (role === 'clientes' && u.profession !== 'client') return false
      if (plano !== 'todos' && (!vet || planoDe(u) !== plano)) return false
      if (situacao === 'online' && u.is_online !== true) return false
      if (situacao === 'desativados' && !u.disabled) return false
      if (situacao === 'ativos' && u.disabled) return false
      if (!term) return true
      return [u.name, u.email, u.id, u.city, u.council].filter(Boolean)
        .some(v => String(v).toLowerCase().includes(term))
    })
    const nome = u => (u.name || u.email || '').toLowerCase()
    return lista.sort((a, b) => {
      if (ordem === 'nome') return nome(a).localeCompare(nome(b))
      if (ordem === 'antigos') return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
    })
  }, [users, q, role, plano, situacao, ordem])

  const visiveis = filtrados.slice(0, limite)

  async function changePlan(u, plan) {
    try {
      await updateDoc(doc(db, 'users', u.id), { plan })
      showToast(`Plano de ${u.name || 'usuário'} alterado para ${plan}.`, 'success')
      setDetail(d => (d ? { ...d, plan } : d))
    } catch (e) { showToast(friendlyError(e, 'Não foi possível alterar o plano.'), 'error') }
  }

  /**
   * Desativar é reversível e tira o acesso na hora (o app observa este
   * campo em tempo real). É o caminho recomendado - excluir apaga o
   * perfil para sempre e não desfaz.
   */
  async function toggleDisabled(u) {
    const novo = !u.disabled
    if (novo) {
      const ok = await confirmDialog({
        title: `Desativar ${u.name || 'esta conta'}?`,
        message: 'A pessoa perde o acesso ao app imediatamente. Você pode reativar quando quiser.',
        confirmLabel: 'Desativar',
        danger: true,
      })
      if (!ok) return
    }
    try {
      await updateDoc(doc(db, 'users', u.id), { disabled: novo })
      showToast(novo ? 'Conta desativada.' : 'Conta reativada.', 'success')
      setDetail(d => (d ? { ...d, disabled: novo } : d))
    } catch (e) { showToast(friendlyError(e, 'Não foi possível alterar a conta.'), 'error') }
  }

  /**
   * Exclusão em cascata: leva junto solicitações, agendamentos,
   * conversas, animais e prontuários. Conta antes de apagar, para o
   * admin ver o tamanho do estrago - não há como desfazer.
   */
  async function removeUser(u) {
    const nome = u.name || u.email || u.id
    setRemoving(true)
    try {
      setProgresso('Levantando dados vinculados...')
      const c = await contarVinculos(u.id)
      setProgresso('')

      const ok = await confirmDialog({
        title: `Excluir a conta de ${nome}?`,
        message: 'Tudo que depende desta conta é apagado junto. Não há como desfazer.',
        details: [
          `${c.solicitacoes} solicitação(ões)`,
          `${c.agendamentos} agendamento(s)`,
          `${c.conversas} conversa(s)`,
          `${c.animais} animal(is) e seus prontuários`,
          `${c.avaliacoes} avaliação(ões)`,
          'O login continua no Firebase Authentication e precisa ser removido por lá.',
          'Para apenas tirar o acesso, cancele e use "Desativar conta".',
        ],
        confirmLabel: 'Excluir tudo',
        confirmText: 'EXCLUIR',
        danger: true,
      })
      if (!ok) { setRemoving(false); return }

      await excluirConta(u.id, etapa => {
        // Guardar a etapa faz a falha dizer ONDE parou - "sem permissão"
        // sozinho não permite diagnosticar nada.
        etapaRef.current = etapa
        setProgresso(`Excluindo: ${etapa}...`)
      })
      showToast('Conta e dados vinculados excluídos.', 'success')
      setDetail(null)
    } catch (e) {
      const onde = etapaRef.current
      console.error(`[admin] exclusão falhou na etapa "${onde}":`, e)
      showToast(
        e?.code === 'permission-denied'
          ? `Sem permissão para apagar: ${onde}.`
          : friendlyError(e, `Falhou ao excluir: ${onde}.`),
        'error',
      )
    } finally {
      setRemoving(false)
      setProgresso('')
    }
  }

  function exportar() {
    if (!filtrados.length) return showToast('Nada para exportar com estes filtros.', 'info')
    baixarCSV('avante-usuarios',
      ['ID', 'Nome', 'E-mail', 'Tipo', 'Plano', 'Cidade', 'CRMV', 'Online', 'Desativado', 'Cadastro'],
      filtrados.map(u => [
        u.id, u.name || '', u.email || '', isVet(u) ? 'Veterinário' : 'Cliente',
        isVet(u) ? planoDe(u) : '', u.city || '', u.council || '',
        u.is_online ? 'sim' : 'não', u.disabled ? 'sim' : 'não', quando(u.createdAt),
      ]))
  }

  if (users === null) return <div className="flex justify-center py-20"><Spinner size={28} color="#375337" /></div>

  return (
    <div className="px-4 pb-4 flex flex-col gap-3">
      <input value={q} onChange={e => setQ(e.target.value)}
        placeholder="Buscar por nome, e-mail, cidade, CRMV ou ID..." className="input-field" />

      <div className="flex flex-col gap-2">
        <Chips value={role} onChange={setRole} options={[
          ['todos', 'Todos'], ['vets', 'Veterinários'], ['clientes', 'Clientes'],
        ]} />
        <Chips value={situacao} onChange={setSituacao} options={[
          ['todos', 'Qualquer situação'], ['online', 'Online'], ['ativos', 'Ativos'], ['desativados', 'Desativados'],
        ]} />
        {role !== 'clientes' && (
          <Chips value={plano} onChange={setPlano} options={[
            ['todos', 'Todos os planos'], ['free', 'Free'], ['essencial', 'Essencial'], ['premium', 'Premium'],
          ]} />
        )}
      </div>

      <div className="flex items-center gap-2">
        <p className="text-xs text-gray-400 flex-1">
          {filtrados.length} usuário{filtrados.length === 1 ? '' : 's'}
        </p>
        <select value={ordem} onChange={e => setOrdem(e.target.value)}
          className="select-field !py-1.5 !text-xs !w-auto">
          <option value="recentes">Mais recentes</option>
          <option value="antigos">Mais antigos</option>
          <option value="nome">Nome (A-Z)</option>
        </select>
        <button onClick={exportar} className="btn-outline btn-sm">Exportar</button>
      </div>

      <div className="flex flex-col gap-2">
        {visiveis.map(u => {
          const vet = isVet(u)
          const plan = planoDe(u)
          return (
            <button key={u.id} onClick={() => setDetail(u)}
              className="card flex items-center gap-3 py-3 text-left hover:shadow-card-hover hover:-translate-y-px active:scale-[0.99] transition-all">
              <div className="relative flex-shrink-0">
                <div className="avatar-circle w-10 h-10 text-sm">{(u.name || u.email || '?')[0].toUpperCase()}</div>
                {vet && u.is_online && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm truncate ${u.disabled ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {u.name || 'Sem nome'}
                </p>
                <p className="text-xs text-gray-400 truncate">{u.email}</p>
                {u.city && <p className="text-[10px] text-gray-300 truncate">{u.city}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  vet ? 'bg-primary/10 text-primary' : 'bg-blue-50 text-blue-600'
                }`}>{vet ? 'VET' : 'CLIENTE'}</span>
                {vet && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    plan === 'premium' ? 'bg-amber-100 text-amber-700'
                      : plan === 'essencial' ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-400'
                  }`}>{plan.toUpperCase()}</span>
                )}
                {u.disabled && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600">INATIVA</span>
                )}
              </div>
            </button>
          )
        })}
        {filtrados.length === 0 && (
          <p className="text-muted text-center py-10">Nenhum usuário encontrado com estes filtros.</p>
        )}
      </div>

      {filtrados.length > visiveis.length && (
        <button onClick={() => setLimite(l => l + PAGINA)} className="btn-outline btn-block">
          Carregar mais ({filtrados.length - visiveis.length} restantes)
        </button>
      )}

      <Modal open={!!detail} onClose={() => !removing && setDetail(null)} title={detail?.name || 'Usuário'}
        footer={<button onClick={() => setDetail(null)} disabled={removing} className="btn-primary btn-sm px-6">Fechar</button>}>
        {detail && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="avatar-circle w-12 h-12">{(detail.name || detail.email || '?')[0].toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">{detail.name || 'Sem nome'}</p>
                <p className="text-xs text-gray-400 truncate">{detail.email}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                detail.is_online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
              }`}>{detail.is_online ? 'ONLINE' : 'OFFLINE'}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Row label="Tipo" value={isVet(detail) ? 'Veterinário' : 'Cliente'} />
              <Row label="Cadastro" value={quando(detail.createdAt)} />
              {detail.council && <Row label="CRMV" value={detail.council} />}
              {detail.city && <Row label="Cidade" value={detail.city} />}
              {detail.serviceRadius && <Row label="Raio de atendimento" value={`${detail.serviceRadius} km`} />}
              {typeof detail.rating === 'number' && <Row label="Nota média" value={detail.rating.toFixed(1)} />}
            </div>

            <div>
              <p className="field-label !mb-0.5">ID</p>
              <button onClick={() => copiar(detail.id, 'ID')}
                className="text-xs font-mono text-gray-600 bg-gray-50 rounded-lg px-3 py-2 break-all text-left w-full hover:bg-gray-100 transition-colors">
                {detail.id}
              </button>
            </div>

            {isVet(detail) && (
              <Row label="Áreas de atuação"
                value={Array.isArray(detail.specialties) && detail.specialties.length
                  ? detail.specialties.join(', ')
                  : 'Nenhuma. Este vet não recebe emergências'} />
            )}

            {isVet(detail) && (
              <div className="pt-2 border-t border-gray-100">
                <label className="field-label">Plano</label>
                <div className="flex gap-2">
                  {['free', 'essencial', 'premium'].map(p => (
                    <button key={p} onClick={() => changePlan(detail, p)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all hover:-translate-y-px active:scale-95 ${
                        planoDe(detail) === p
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-gray-200 text-gray-500 hover:border-primary/40'
                      }`}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 mt-2">
                  Alterar o plano aqui libera os recursos na hora, sem passar pelo checkout.
                </p>
              </div>
            )}

            {/* Ações da conta - desativar primeiro, por ser reversível */}
            <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
              <label className="field-label">Conta</label>

              {detail.disabled && (
                <p className="text-xs font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2">
                  Esta conta está desativada e não consegue acessar o app.
                </p>
              )}

              <button onClick={() => toggleDisabled(detail)} disabled={removing}
                className={detail.disabled ? 'btn-primary btn-sm btn-block' : 'btn-danger btn-sm btn-block'}>
                {detail.disabled ? 'Reativar conta' : 'Desativar conta'}
              </button>

              <button onClick={() => removeUser(detail)} disabled={removing}
                className="btn-ghost btn-sm btn-block !text-red-500 hover:!bg-red-50">
                {removing ? <Spinner size={16} /> : 'Excluir conta e todos os dados'}
              </button>

              {progresso && (
                <p className="text-[11px] text-gray-500 text-center animate-pulse">{progresso}</p>
              )}

              <p className="text-[11px] text-gray-400">
                Desativar tira o acesso na hora e pode ser desfeito. Excluir apaga a
                conta e tudo que depende dela (solicitações, agendamentos, conversas,
                animais e prontuários) sem volta. O login continua no Firebase
                Authentication e precisa ser removido por lá.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/** Linha de filtros que rola na horizontal - cabe no celular. */
function Chips({ value, onChange, options }) {
  return (
    <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-0.5">
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all
                      hover:-translate-y-px active:scale-95 ${
            value === k ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200'
          }`}>{l}</button>
      ))}
    </div>
  )
}

function Row({ label, value, mono }) {
  return (
    <div>
      <p className="field-label !mb-0.5">{label}</p>
      <p className={`text-sm text-gray-800 break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  )
}

/* ════════════════ ABA SOLICITAÇÕES ════════════════
   Moderação: ver o que está travado, destravar uma emergência que
   ninguém aceitou e apagar lixo de teste. */
function RequestsTab({ filtroInicial }) {
  const [reqs, setReqs] = useState(null)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState(
    ['pendente', 'urgente', 'finalizado'].includes(filtroInicial) ? filtroInicial : 'todos')
  const [limite, setLimite] = useState(PAGINA)
  const [detail, setDetail] = useState(null)
  const [agindo, setAgindo] = useState(false)

  useEffect(() => {
    return onSnapshot(collection(db, 'requests'),
      snap => setReqs(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => {
        console.error('[admin] requests:', e)
        showToast(friendlyError(e, 'Não foi possível carregar as solicitações.'), 'error')
        setReqs([])
      })
  }, [])

  useEffect(() => { setLimite(PAGINA) }, [q, filtro])

  const filtrados = useMemo(() => {
    if (!reqs) return []
    const term = q.trim().toLowerCase()
    return reqs
      .filter(r => {
        const st = normalizeStatus(r.status)
        if (filtro === 'ativos' && !['aceito', 'a_caminho', 'em_andamento', 'orcamento'].includes(st)) return false
        if (['pendente', 'urgente', 'finalizado', 'rejeitado'].includes(filtro) && st !== filtro) return false
        if (!term) return true
        return [r.clientName, r.professionalName, r.petName, r.serviceType, r.description, r.id]
          .filter(Boolean).some(v => String(v).toLowerCase().includes(term))
      })
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
  }, [reqs, q, filtro])

  const visiveis = filtrados.slice(0, limite)

  /** Solta uma emergência presa a um vet que nunca respondeu. */
  async function devolverParaFila(r) {
    const ok = await confirmDialog({
      title: 'Devolver para a fila?',
      message: 'A solicitação volta a ficar disponível para qualquer veterinário da área correspondente aceitar.',
      confirmLabel: 'Devolver',
    })
    if (!ok) return
    setAgindo(true)
    try {
      await updateDoc(doc(db, 'requests', r.id), { professionalId: null, status: 'pendente' })
      showToast('Solicitação devolvida para a fila.', 'success')
      setDetail(null)
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível devolver a solicitação.'), 'error')
    } finally { setAgindo(false) }
  }

  async function apagar(r) {
    const ok = await confirmDialog({
      title: 'Apagar esta solicitação?',
      message: 'Ela some do histórico do cliente e do veterinário. A conversa ligada a ela continua existindo.',
      confirmLabel: 'Apagar',
      confirmText: 'APAGAR',
      danger: true,
    })
    if (!ok) return
    setAgindo(true)
    try {
      await deleteDoc(doc(db, 'requests', r.id))
      showToast('Solicitação apagada.', 'success')
      setDetail(null)
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível apagar a solicitação.'), 'error')
    } finally { setAgindo(false) }
  }

  function exportar() {
    if (!filtrados.length) return showToast('Nada para exportar com estes filtros.', 'info')
    baixarCSV('avante-solicitacoes',
      ['ID', 'Status', 'Cliente', 'Veterinário', 'Animal', 'Serviço', 'Valor aprovado', 'Criada em'],
      filtrados.map(r => [
        r.id, statusInfo(r.status).label, r.clientName || '', r.professionalName || '',
        r.petName || '', r.serviceType || '',
        r.quote?.approvedAt ? String(r.quote?.total ?? '') : '', quando(r.createdAt),
      ]))
  }

  if (reqs === null) return <div className="flex justify-center py-20"><Spinner size={28} color="#375337" /></div>

  return (
    <div className="px-4 pb-4 flex flex-col gap-3">
      <input value={q} onChange={e => setQ(e.target.value)}
        placeholder="Buscar por cliente, veterinário, animal ou ID..." className="input-field" />

      <Chips value={filtro} onChange={setFiltro} options={[
        ['todos', 'Todas'], ['urgente', 'Emergências'], ['pendente', 'Pendentes'],
        ['ativos', 'Em andamento'], ['finalizado', 'Finalizadas'], ['rejeitado', 'Recusadas'],
      ]} />

      <div className="flex items-center gap-2">
        <p className="text-xs text-gray-400 flex-1">
          {filtrados.length} solicitaç{filtrados.length === 1 ? 'ão' : 'ões'}
        </p>
        <button onClick={exportar} className="btn-outline btn-sm">Exportar</button>
      </div>

      <div className="flex flex-col gap-2">
        {visiveis.map(r => {
          const info = statusInfo(r.status)
          const semVet = !r.professionalId
          return (
            <button key={r.id} onClick={() => setDetail(r)}
              className="card flex items-start gap-3 py-3 text-left hover:shadow-card-hover hover:-translate-y-px active:scale-[0.99] transition-all">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-800 truncate">
                  {r.petName || r.serviceType || 'Solicitação'}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {r.clientName || 'Cliente'} · {r.professionalName || (semVet ? 'sem veterinário' : '-')}
                </p>
                <p className="text-[10px] text-gray-300 mt-0.5">{quando(r.createdAt)}</p>
              </div>
              <span className={`${info.cls} flex-shrink-0`}>{info.label}</span>
            </button>
          )
        })}
        {filtrados.length === 0 && (
          <p className="text-muted text-center py-10">Nenhuma solicitação com estes filtros.</p>
        )}
      </div>

      {filtrados.length > visiveis.length && (
        <button onClick={() => setLimite(l => l + PAGINA)} className="btn-outline btn-block">
          Carregar mais ({filtrados.length - visiveis.length} restantes)
        </button>
      )}

      <Modal open={!!detail} onClose={() => !agindo && setDetail(null)} title="Solicitação"
        footer={<button onClick={() => setDetail(null)} disabled={agindo} className="btn-primary btn-sm px-6">Fechar</button>}>
        {detail && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className={statusInfo(detail.status).cls}>{statusInfo(detail.status).label}</span>
              <span className="text-xs text-gray-400">{quando(detail.createdAt)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Row label="Cliente" value={detail.clientName || '-'} />
              <Row label="Veterinário" value={detail.professionalName || 'Nenhum'} />
              {detail.petName && <Row label="Animal" value={detail.petName} />}
              {detail.serviceType && <Row label="Serviço" value={detail.serviceType} />}
              {detail.quote?.total != null && (
                <Row label="Orçamento" value={`${money(detail.quote.total)}${detail.quote.approvedAt ? ' (aprovado)' : ' (aguardando)'}`} />
              )}
            </div>

            {detail.description && <Row label="Descrição" value={detail.description} />}

            <div>
              <p className="field-label !mb-0.5">ID</p>
              <button onClick={() => copiar(detail.id, 'ID')}
                className="text-xs font-mono text-gray-600 bg-gray-50 rounded-lg px-3 py-2 break-all text-left w-full hover:bg-gray-100 transition-colors">
                {detail.id}
              </button>
            </div>

            <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
              <label className="field-label">Ações</label>
              {detail.professionalId && normalizeStatus(detail.status) !== 'finalizado' && (
                <button onClick={() => devolverParaFila(detail)} disabled={agindo}
                  className="btn-outline btn-sm btn-block">
                  Devolver para a fila
                </button>
              )}
              <button onClick={() => apagar(detail)} disabled={agindo}
                className="btn-ghost btn-sm btn-block !text-red-500 hover:!bg-red-50">
                {agindo ? <Spinner size={16} /> : 'Apagar solicitação'}
              </button>
              <p className="text-[11px] text-gray-400">
                Devolver para a fila serve quando o veterinário aceitou e sumiu: o
                pedido volta a aparecer para os outros profissionais da área.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ════════════════ ABA OFERTAS ════════════════ */
function OffersTab() {
  const [offers, setOffers] = useState(null)
  const [editing, setEditing] = useState(null) // objeto da oferta no modal
  const [seeding, setSeeding] = useState(false)
  const [publico, setPublico] = useState('todos')

  useEffect(() => {
    return onSnapshot(collection(db, 'offers'),
      snap => setOffers(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))),
      e => {
        console.error('[admin] offers:', e)
        showToast(friendlyError(e, 'Não foi possível carregar as ofertas.'), 'error')
        setOffers([])
      })
  }, [])

  const visiveis = useMemo(() => {
    if (!offers) return []
    if (publico === 'todos') return offers
    if (publico === 'ativas') return offers.filter(o => o.active)
    return offers.filter(o => (o.audience || 'all') === publico)
  }, [offers, publico])

  async function seedTemplates() {
    setSeeding(true)
    try {
      for (const t of OFFER_TEMPLATES) {
        await addDoc(collection(db, 'offers'), { ...t, createdAt: serverTimestamp() })
      }
      showToast(`${OFFER_TEMPLATES.length} ofertas modelo inseridas. Edite e ative quando quiser.`, 'success')
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível inserir as ofertas modelo.'), 'error')
    } finally { setSeeding(false) }
  }

  async function toggleActive(o) {
    try {
      await updateDoc(doc(db, 'offers', o.id), { active: !o.active })
      showToast(o.active ? 'Oferta desativada.' : 'Oferta ativada e visível no app.', 'success')
    } catch (e) { showToast(friendlyError(e, 'Não foi possível alterar a oferta.'), 'error') }
  }

  /** Duplicar poupa refazer um banner inteiro para trocar uma palavra. */
  async function duplicar(o) {
    try {
      const { id, createdAt, ...resto } = o
      await addDoc(collection(db, 'offers'), {
        ...resto, title: `${o.title} (cópia)`, active: false, createdAt: serverTimestamp(),
      })
      showToast('Oferta duplicada como inativa.', 'success')
    } catch (e) { showToast(friendlyError(e, 'Não foi possível duplicar a oferta.'), 'error') }
  }

  async function saveOffer() {
    const o = editing
    if (!o.title.trim()) return showToast('O título é obrigatório.', 'error')
    if (o.url && o.url !== 'https://' && !o.url.trim().startsWith('https://')) {
      return showToast('O link precisa começar com https://', 'error')
    }
    try {
      const data = {
        emoji: o.emoji || '🐾', title: o.title.trim(), subtitle: (o.subtitle || '').trim(),
        cta: o.cta?.trim() || 'Ver oferta', url: (o.url || '').trim(),
        active: !!o.active, order: Number(o.order) || 9,
        size: o.size || 'small', audience: o.audience || 'all', gradient: o.gradient || 'amber',
      }
      if (o.id) await updateDoc(doc(db, 'offers', o.id), data)
      else await addDoc(collection(db, 'offers'), { ...data, createdAt: serverTimestamp() })
      setEditing(null)
      showToast('Oferta salva.', 'success')
    } catch (e) { showToast(friendlyError(e, 'Não foi possível salvar a oferta.'), 'error') }
  }

  async function removeOffer(id) {
    const ok = await confirmDialog({
      title: 'Excluir esta oferta?',
      message: 'Ela some do painel e do app. Não há como desfazer.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteDoc(doc(db, 'offers', id))
      setEditing(null)
      showToast('Oferta excluída.', 'success')
    } catch (e) { showToast(friendlyError(e, 'Não foi possível excluir a oferta.'), 'error') }
  }

  if (offers === null) return <div className="flex justify-center py-20"><Spinner size={28} color="#375337" /></div>

  const ativas = offers.filter(o => o.active).length

  return (
    <div className="px-4 pb-4 flex flex-col gap-3">
      <p className="text-xs text-gray-400">
        {ativas} de {offers.length} oferta(s) aparecendo no app. As inativas ficam guardadas aqui.
      </p>

      {offers.length > 0 && (
        <Chips value={publico} onChange={setPublico} options={[
          ['todos', 'Todas'], ['ativas', 'Só ativas'], ['client', 'Clientes'], ['vet', 'Veterinários'],
        ]} />
      )}

      {offers.length === 0 && (
        <button onClick={seedTemplates} disabled={seeding}
          className="border-2 border-dashed border-primary/30 text-primary rounded-2xl py-5 text-sm font-bold
                     hover:bg-primary/5 transition-colors">
          {seeding ? 'Inserindo...' : 'Inserir ofertas modelo (cliente + veterinário)'}
        </button>
      )}

      <div className="flex flex-col gap-2 stagger">
        {visiveis.map(o => (
          <div key={o.id} className="card flex items-center gap-3 py-3">
            <span className="text-2xl flex-shrink-0">{o.emoji || '🐾'}</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-gray-800 truncate">{o.title}</p>
              <p className="text-xs text-gray-400 truncate">{o.subtitle}</p>
              <div className="flex gap-1 mt-1">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                  {{ all: 'TODOS', client: 'CLIENTES', vet: 'VETS' }[o.audience || 'all']}
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                  {(o.size || 'small') === 'large' ? 'BANNER' : 'FAIXA'}
                </span>
              </div>
            </div>
            <button onClick={() => toggleActive(o)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 transition-all hover:-translate-y-px ${
                o.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
              }`}>
              {o.active ? 'ATIVA' : 'INATIVA'}
            </button>
            <button onClick={() => duplicar(o)} className="text-gray-300 hover:text-primary p-1" aria-label="Duplicar">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button onClick={() => setEditing({ ...o })} className="text-gray-300 hover:text-primary p-1" aria-label="Editar">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        ))}
        {offers.length > 0 && visiveis.length === 0 && (
          <p className="text-muted text-center py-8">Nenhuma oferta neste filtro.</p>
        )}
      </div>

      <button onClick={() => setEditing({ ...EMPTY_OFFER })} className="btn-primary btn-block mt-1">
        Nova oferta
      </button>

      {/* Modal de edição */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar oferta' : 'Nova oferta'}
        footer={
          <>
            {editing?.id && (
              <button onClick={() => removeOffer(editing.id)} className="btn-ghost btn-sm !text-red-500 mr-auto">
                Excluir
              </button>
            )}
            <button onClick={() => setEditing(null)} className="btn-ghost btn-sm">Cancelar</button>
            <button onClick={saveOffer} className="btn-primary btn-sm px-6">Salvar</button>
          </>
        }>
        {editing && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[70px_1fr] gap-2">
              <div>
                <label className="field-label">Emoji</label>
                <input value={editing.emoji} onChange={e => setEditing(o => ({ ...o, emoji: e.target.value }))}
                  className="input-field text-center" maxLength={4} />
              </div>
              <div>
                <label className="field-label">Título</label>
                <input value={editing.title} onChange={e => setEditing(o => ({ ...o, title: e.target.value }))}
                  className="input-field" placeholder="Ração premium com 15% OFF" />
              </div>
            </div>
            <div>
              <label className="field-label">Subtítulo</label>
              <input value={editing.subtitle} onChange={e => setEditing(o => ({ ...o, subtitle: e.target.value }))}
                className="input-field" placeholder="Para cães e gatos · entrega na região" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">Texto do botão</label>
                <input value={editing.cta} onChange={e => setEditing(o => ({ ...o, cta: e.target.value }))}
                  className="input-field" />
              </div>
              <div>
                <label className="field-label">Ordem</label>
                <input type="number" value={editing.order} onChange={e => setEditing(o => ({ ...o, order: e.target.value }))}
                  className="input-field" />
              </div>
            </div>
            <div>
              <label className="field-label">Link (https://...)</label>
              <input value={editing.url} onChange={e => setEditing(o => ({ ...o, url: e.target.value }))}
                className="input-field" placeholder="https://loja.exemplo.com.br" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="field-label">Tamanho</label>
                <select value={editing.size || 'small'} onChange={e => setEditing(o => ({ ...o, size: e.target.value }))}
                  className="select-field">
                  <option value="small">Pequeno (faixa)</option>
                  <option value="large">Grande (banner)</option>
                </select>
              </div>
              <div>
                <label className="field-label">Público</label>
                <select value={editing.audience || 'all'} onChange={e => setEditing(o => ({ ...o, audience: e.target.value }))}
                  className="select-field">
                  <option value="all">Todos</option>
                  <option value="client">Só clientes</option>
                  <option value="vet">Só veterinários</option>
                </select>
              </div>
            </div>
            <div>
              <label className="field-label">Cor (banner grande)</label>
              <select value={editing.gradient || 'amber'} onChange={e => setEditing(o => ({ ...o, gradient: e.target.value }))}
                className="select-field">
                <option value="amber">Âmbar</option>
                <option value="blue">Azul</option>
                <option value="green">Verde</option>
                <option value="purple">Roxo</option>
                <option value="red">Vermelho</option>
                <option value="teal">Turquesa</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 mt-1">
              <input type="checkbox" checked={!!editing.active}
                onChange={e => setEditing(o => ({ ...o, active: e.target.checked }))}
                className="w-4 h-4 accent-primary" />
              Ativa (visível no app)
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* ════════════════ ABA PLANOS ════════════════ */
function PlansTab() {
  const [plans, setPlans] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getDoc(doc(db, 'config', 'plans')).then(snap => {
      setPlans(snap.exists() && Array.isArray(snap.data().plans)
        ? snap.data().plans
        : DEFAULT_PLANS)
    }).catch(e => {
      showToast(friendlyError(e, 'Não foi possível carregar os planos. Mostrando os padrões.'), 'error')
      setPlans(DEFAULT_PLANS)
    })
  }, [])

  function update(i, patch) {
    setPlans(ps => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }

  async function save() {
    setSaving(true)
    try {
      const clean = plans.map(p => ({
        ...p,
        price: Number(p.price) || 0,
        benefits: (Array.isArray(p.benefits) ? p.benefits : []).map(b => b.trim()).filter(Boolean),
      }))
      await setDoc(doc(db, 'config', 'plans'), { plans: clean, updatedAt: serverTimestamp() })
      showToast('Planos salvos. Já valem na página de planos do veterinário.', 'success')
    } catch (e) {
      showToast(friendlyError(e, 'Não foi possível salvar os planos.'), 'error')
    } finally { setSaving(false) }
  }

  async function restaurar() {
    const ok = await confirmDialog({
      title: 'Restaurar os planos padrão?',
      message: 'Preços e benefícios voltam aos valores de fábrica. Nada é salvo até você tocar em "Salvar planos".',
      confirmLabel: 'Restaurar',
    })
    if (ok) setPlans(DEFAULT_PLANS)
  }

  if (plans === null) return <div className="flex justify-center py-20"><Spinner size={28} color="#375337" /></div>

  return (
    <div className="px-4 pb-4 flex flex-col gap-4">
      <p className="text-xs text-gray-400">
        Preço e benefícios valem na hora para a página de planos do veterinário
        e para o checkout AbacatePay.
      </p>

      {plans.map((p, i) => (
        <div key={p.id} className={`card flex flex-col gap-3 ${(p.id === 'premium' || p.id === 'destaque') ? 'border-2 border-amber-300' : ''}`}>
          <div className="flex items-center justify-between">
            <p className="font-bold text-gray-800">{p.name} <span className="text-[10px] text-gray-300 font-mono">({p.id})</span></p>
            {(p.id === 'premium' || p.id === 'destaque') && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">PREMIUM</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label">Preço (R$)</label>
              <input type="number" step="0.10" min="0" value={p.price}
                onChange={e => update(i, { price: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="field-label">Cobrança</label>
              <select value={p.billing} onChange={e => update(i, { billing: e.target.value })} className="select-field">
                <option value="sempre">Sempre gratuito</option>
                <option value="unico">Pagamento único</option>
                <option value="mensal">Mensal</option>
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">Benefícios (um por linha)</label>
            <textarea
              rows={4}
              value={(p.benefits || []).join('\n')}
              onChange={e => update(i, { benefits: e.target.value.split('\n') })}
              className="input-field resize-none leading-relaxed"
            />
          </div>
        </div>
      ))}

      <div className="btn-row">
        <button onClick={restaurar} className="btn-outline flex-1">Restaurar padrão</button>
        <button onClick={save} disabled={saving} className="btn-primary flex-1">
          {saving ? <Spinner /> : 'Salvar planos'}
        </button>
      </div>
    </div>
  )
}
