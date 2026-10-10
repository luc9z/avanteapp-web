/**
 * Regras de dinheiro dos planos, sem Firebase (npm run test:pagamentos).
 *
 * Tudo que decide QUANTO se cobra e ATÉ QUANDO o plano vale mora aqui,
 * no servidor. O app só mostra; nunca manda valor nem data.
 */

/**
 * Catálogo usado quando config/plans não existe (ex.: depois de um
 * reset do banco). TEM que bater com DEFAULT_PLANS do app
 * (src/pages/admin/AdminPage.jsx): o teste confere. Sem isto, o app
 * mostrava os planos padrão e o checkout respondia "Plano não encontrado".
 */
const PLANOS_PADRAO = [
  { id: 'free', name: 'Free', price: 0 },
  { id: 'essencial', name: 'Essencial', price: 29.9 },
  { id: 'premium', name: 'Premium', price: 59.9 },
]

/** Quanto tempo cada pagamento libera. PIX não renova sozinho. */
const DIAS_POR_PERIODO = { mensal: 30, anual: 365 }

/** Planos que dão o selo de Destaque na busca. */
const PLANOS_DESTAQUE = ['premium', 'destaque']

/** Para onde o checkout pode devolver a pessoa. Fora disso, o domínio oficial. */
const ORIGENS = [
  'https://avante.vet.br',
  'https://www.avante.vet.br',
  'https://avante-pro.web.app',
  'https://avante-pro.firebaseapp.com',
]

function planoDoCatalogo(catalogo, planId) {
  const lista = Array.isArray(catalogo) && catalogo.length ? catalogo : PLANOS_PADRAO
  return lista.find(p => p && p.id === planId) || null
}

function periodoValido(p) {
  return p === 'anual' ? 'anual' : 'mensal'
}

/** Anual = 12 meses pelo preço de 10. Desconto em %, de cupom parcial. */
function valorEmCentavos(preco, periodo, descontoPct = 0) {
  const base = periodoValido(periodo) === 'anual' ? Number(preco) * 10 : Number(preco)
  const desc = Math.min(100, Math.max(0, Number(descontoPct) || 0))
  return Math.max(0, Math.round(base * 100 * (100 - desc) / 100))
}

/**
 * Até quando o plano vale depois de um pagamento.
 * Mesmo plano ainda em vigor: soma ao que falta (quem renova antes não
 * perde dias). Plano diferente ou vencido: conta a partir de agora.
 */
function novaExpiracao({ agora, expiraAtual, planoAtual, planoNovo, periodo }) {
  const dias = DIAS_POR_PERIODO[periodoValido(periodo)]
  const atual = expiraAtual ? new Date(expiraAtual).getTime() : 0
  const base = planoAtual === planoNovo && atual > agora ? atual : agora
  return new Date(base + dias * 864e5)
}

function origemSegura(origem) {
  const o = String(origem || '')
  if (ORIGENS.includes(o) || /^http:\/\/localhost:\d{2,5}$/.test(o)) return o
  return ORIGENS[0]
}

/** Chave do produto na AbacatePay: muda se o preço mudar. */
function chaveProduto(planId, periodo, centavos) {
  return `avante-${planId}-${periodoValido(periodo)}-${centavos}`
}

/**
 * O pagamento confirmado pela AbacatePay cobre o que registramos?
 * Comparado com o NOSSO registro do checkout, nunca com o corpo do webhook.
 */
function pagamentoConfere(checkout, registro) {
  if (!checkout || checkout.status !== 'PAID') return { ok: false, motivo: `status ${checkout && checkout.status}` }
  const pago = Number(checkout.paidAmount != null ? checkout.paidAmount : checkout.amount)
  if (!(pago >= registro.centavos)) return { ok: false, motivo: `pago ${pago} < esperado ${registro.centavos}` }
  return { ok: true }
}

/** Renovar o mesmo plano só abre a partir de tantos dias antes de vencer. */
const JANELA_RENOVACAO_DIAS = 5

/**
 * Pode pagar este plano agora? Trocar de plano sempre pode. O MESMO plano
 * só quando faltam até 5 dias para vencer: antes, a pessoa pagava de novo
 * por engano o que já tinha. Plano de cupom não vence, então não renova.
 */
function podePagar({ agora, planoAtual, expiraAtual, planoNovo }) {
  if ((planoAtual || 'free') !== planoNovo) return { ok: true }
  if (!expiraAtual) return { ok: false, motivo: 'sem-vencimento' }
  const faltam = (new Date(expiraAtual).getTime() - agora) / 864e5
  if (faltam > JANELA_RENOVACAO_DIAS) return { ok: false, motivo: 'cedo', ate: new Date(expiraAtual) }
  return { ok: true }
}

module.exports = {
  JANELA_RENOVACAO_DIAS, podePagar,
  PLANOS_PADRAO, DIAS_POR_PERIODO, PLANOS_DESTAQUE, ORIGENS,
  planoDoCatalogo, periodoValido, valorEmCentavos, novaExpiracao,
  origemSegura, chaveProduto, pagamentoConfere,
}
