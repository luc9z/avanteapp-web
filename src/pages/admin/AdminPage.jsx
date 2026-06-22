/**
 * AdminPage — painel do dono do app (/admin).
 *
 * Acesso: apenas usuários com documento em admins/{uid}.
 * Para se tornar admin: Console Firebase → Firestore → criar
 * coleção "admins" → documento com ID = seu uid (a tela de acesso
 * negado mostra o uid para copiar).
 *
 * Abas:
 *  - Ofertas: anúncios exibidos no app (coleção offers), com botão
 *    que insere 3 modelos pré-moldados para ajustar depois.
 *  - Planos: valores e benefícios (config/plans) usados na página
 *    de planos do veterinário e no checkout AbacatePay.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  doc, getDoc, setDoc, collection, onSnapshot, addDoc, updateDoc,
  deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../../components/common/Spinner'
import Modal from '../../components/common/Modal'
import { showToast } from '../../components/common/Toast'
import { friendlyError } from '../../utils/errors'

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

/* ── Planos padrão (valores fictícios — ajuste na própria tela) ── */
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

export default function AdminPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin] = useState(null)
  const [tab, setTab] = useState('ofertas')

  const [denyReason, setDenyReason] = useState(null)

  useEffect(() => {
    if (!user?.uid) return
    getDoc(doc(db, 'admins', user.uid))
      .then(snap => setIsAdmin(snap.exists()))
      .catch(e => {
        // permission-denied aqui normalmente significa que o
        // firestore.rules deste projeto ainda não foi publicado
        setDenyReason(e?.code === 'permission-denied' ? 'rules' : null)
        setIsAdmin(false)
      })
  }, [user?.uid])

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
        {denyReason === 'rules' ? (
          <p className="text-sm text-gray-500 max-w-sm">
            O banco recusou a leitura — as regras de segurança deste projeto estão
            desatualizadas. Publique o arquivo <b>firestore.rules</b> com{' '}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">firebase deploy --only firestore:rules</code>{' '}
            e tente novamente.
          </p>
        ) : (
          <p className="text-sm text-gray-500 max-w-sm">
            Para liberar seu acesso, crie no Firestore (console) a coleção <b>admins</b> com
            um documento cujo ID seja o seu uid:
          </p>
        )}
        <code className="bg-gray-100 text-gray-700 text-xs px-3 py-2 rounded-lg break-all select-all">
          {user?.uid}
        </code>
        <button onClick={() => navigate('/')} className="btn-primary px-6 mt-2">Voltar</button>
      </div>
    )
  }

  return (
    <div className="page-container pb-10">
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary" aria-label="Voltar">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="page-title">Administração</h1>
        <div className="w-6" />
      </div>

      {/* Abas */}
      <div className="px-4 pt-3">
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {[['ofertas', 'Ofertas'], ['planos', 'Planos']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                tab === id ? 'bg-white text-primary shadow-sm' : 'text-gray-400'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'ofertas' ? <OffersTab /> : <PlansTab />}
    </div>
  )
}

/* ════════════════ ABA OFERTAS ════════════════ */
function OffersTab() {
  const [offers, setOffers] = useState(null)
  const [editing, setEditing] = useState(null) // objeto da oferta no modal
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    return onSnapshot(collection(db, 'offers'),
      snap => setOffers(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))),
      () => setOffers([]))
  }, [])

  async function seedTemplates() {
    setSeeding(true)
    try {
      for (const t of OFFER_TEMPLATES) {
        await addDoc(collection(db, 'offers'), { ...t, createdAt: serverTimestamp() })
      }
      showToast(`${OFFER_TEMPLATES.length} ofertas modelo inseridas (cliente + vet)! Edite e ative quando quiser.`, 'success')
    } catch (e) {
      showToast(friendlyError(e), 'error')
    } finally { setSeeding(false) }
  }

  async function toggleActive(o) {
    try {
      await updateDoc(doc(db, 'offers', o.id), { active: !o.active })
    } catch (e) { showToast(friendlyError(e), 'error') }
  }

  async function saveOffer() {
    const o = editing
    if (!o.title.trim()) return showToast('Título é obrigatório', 'error')
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
      showToast('Oferta salva!', 'success')
    } catch (e) { showToast(friendlyError(e), 'error') }
  }

  async function removeOffer(id) {
    try { await deleteDoc(doc(db, 'offers', id)); setEditing(null) }
    catch (e) { showToast(friendlyError(e), 'error') }
  }

  if (offers === null) return <div className="flex justify-center py-20"><Spinner size={28} color="#375337" /></div>

  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      <p className="text-xs text-gray-400">
        Ofertas <b>ativas</b> aparecem no app dos clientes. As inativas ficam guardadas aqui.
      </p>

      {offers.length === 0 && (
        <button onClick={seedTemplates} disabled={seeding}
          className="border-2 border-dashed border-primary/30 text-primary rounded-2xl py-5 text-sm font-bold
                     hover:bg-primary/5 transition-colors">
          {seeding ? 'Inserindo...' : '✨ Inserir ofertas modelo (cliente + veterinário)'}
        </button>
      )}

      <div className="flex flex-col gap-2 stagger">
        {offers.map(o => (
          <div key={o.id} className="card flex items-center gap-3 py-3">
            <span className="text-2xl flex-shrink-0">{o.emoji || '🐾'}</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-gray-800 truncate">{o.title}</p>
              <p className="text-xs text-gray-400 truncate">{o.subtitle}</p>
              <div className="flex gap-1 mt-1">
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                  {{ all: '👥 Todos', client: '🐶 Clientes', vet: '🩺 Vets' }[o.audience || 'all']}
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                  {(o.size || 'small') === 'large' ? '🖼️ Grande' : '➖ Pequeno'}
                </span>
              </div>
            </div>
            <button onClick={() => toggleActive(o)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 transition-colors ${
                o.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
              }`}>
              {o.active ? 'ATIVA' : 'INATIVA'}
            </button>
            <button onClick={() => setEditing({ ...o })} className="text-gray-300 hover:text-primary p-1" aria-label="Editar">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <button onClick={() => setEditing({ ...EMPTY_OFFER })} className="btn-primary w-full mt-1">
        + Nova oferta
      </button>

      {/* Modal de edição */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar oferta' : 'Nova oferta'}
        footer={
          <>
            {editing?.id && (
              <button onClick={() => removeOffer(editing.id)} className="text-red-500 text-sm font-semibold mr-auto px-2">
                Excluir
              </button>
            )}
            <button onClick={() => setEditing(null)} className="px-4 py-2 text-gray-500 font-medium">Cancelar</button>
            <button onClick={saveOffer} className="btn-primary px-6 py-2">Salvar</button>
          </>
        }>
        {editing && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-[70px_1fr] gap-2">
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">Emoji</label>
                <input value={editing.emoji} onChange={e => setEditing(o => ({ ...o, emoji: e.target.value }))}
                  className="input-field text-center" maxLength={4} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">Título</label>
                <input value={editing.title} onChange={e => setEditing(o => ({ ...o, title: e.target.value }))}
                  className="input-field" placeholder="Ração premium com 15% OFF" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-400 mb-1 block">Subtítulo</label>
              <input value={editing.subtitle} onChange={e => setEditing(o => ({ ...o, subtitle: e.target.value }))}
                className="input-field" placeholder="Para cães e gatos · entrega na região" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">Texto do botão</label>
                <input value={editing.cta} onChange={e => setEditing(o => ({ ...o, cta: e.target.value }))}
                  className="input-field" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">Ordem</label>
                <input type="number" value={editing.order} onChange={e => setEditing(o => ({ ...o, order: e.target.value }))}
                  className="input-field" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-400 mb-1 block">Link (https://...)</label>
              <input value={editing.url} onChange={e => setEditing(o => ({ ...o, url: e.target.value }))}
                className="input-field" placeholder="https://loja.exemplo.com.br" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">Tamanho</label>
                <select value={editing.size || 'small'} onChange={e => setEditing(o => ({ ...o, size: e.target.value }))}
                  className="select-field">
                  <option value="small">Pequeno (faixa)</option>
                  <option value="large">Grande (banner)</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">Público</label>
                <select value={editing.audience || 'all'} onChange={e => setEditing(o => ({ ...o, audience: e.target.value }))}
                  className="select-field">
                  <option value="all">Todos</option>
                  <option value="client">Só clientes</option>
                  <option value="vet">Só veterinários</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-400 mb-1 block">Cor (banner grande)</label>
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
    }).catch(() => setPlans(DEFAULT_PLANS))
  }, [])

  function update(i, patch) {
    setPlans(ps => ps.map((p, idx) => idx === i ? { ...p, ...patch } : p))
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
      showToast('Planos salvos! Já valem na página de planos do veterinário.', 'success')
    } catch (e) {
      showToast(friendlyError(e), 'error')
    } finally { setSaving(false) }
  }

  if (plans === null) return <div className="flex justify-center py-20"><Spinner size={28} color="#375337" /></div>

  return (
    <div className="px-4 py-4 flex flex-col gap-4">
      <p className="text-xs text-gray-400">
        Os valores abaixo são <b>fictícios</b> — ajuste preço e benefícios e salve.
        O checkout AbacatePay usa exatamente o que estiver aqui.
      </p>

      {plans.map((p, i) => (
        <div key={p.id} className={`card flex flex-col gap-3 ${(p.id === 'premium' || p.id === 'destaque') ? 'border-2 border-amber-300' : ''}`}>
          <div className="flex items-center justify-between">
            <p className="font-bold text-gray-800">{p.name} <span className="text-[10px] text-gray-300 font-mono">({p.id})</span></p>
            {(p.id === 'premium' || p.id === 'destaque') && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⭐ PREMIUM</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-gray-400 mb-1 block">Preço (R$)</label>
              <input type="number" step="0.10" min="0" value={p.price}
                onChange={e => update(i, { price: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-400 mb-1 block">Cobrança</label>
              <select value={p.billing} onChange={e => update(i, { billing: e.target.value })} className="select-field">
                <option value="sempre">Sempre gratuito</option>
                <option value="unico">Pagamento único</option>
                <option value="mensal">Mensal</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-400 mb-1 block">Benefícios (um por linha)</label>
            <textarea
              rows={4}
              value={(p.benefits || []).join('\n')}
              onChange={e => update(i, { benefits: e.target.value.split('\n') })}
              className="input-field resize-none leading-relaxed"
            />
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <button onClick={() => setPlans(DEFAULT_PLANS)} className="btn-outline flex-1">Restaurar padrão</button>
        <button onClick={save} disabled={saving} className="btn-primary flex-1">
          {saving ? <Spinner /> : 'Salvar planos'}
        </button>
      </div>
    </div>
  )
}
