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
  { id: 'premium', name: 'Premium', price: 49.9 },
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
function novaExpiracao({ agora, expiraAtual, planoAtual, planoNovo, periodo, carenciaDias = 0 }) {
  const dias = DIAS_POR_PERIODO[periodoValido(periodo)]
  const atual = expiraAtual ? new Date(expiraAtual).getTime() : 0
  const base = planoAtual === planoNovo && atual > agora ? atual : agora
  // A folga entra só quando o plano começa agora. Numa renovação ela já
  // está no vencimento atual; somar de novo daria dias grátis a cada mês.
  const folga = base === agora ? Number(carenciaDias) || 0 : 0
  return new Date(base + (dias + folga) * 864e5)
}

/**
 * Assinatura recorrente (Cakto): a cobrança da renovação cai perto do
 * vencimento e o aviso pode atrasar. Com esta folga no início, o plano
 * não volta ao Free na madrugada antes de a renovação chegar.
 */
const CARENCIA_ASSINATURA_DIAS = 3

const OFERTA_RE = /^[A-Za-z0-9_-]{3,64}$/

/**
 * Oferta da Cakto que cobra este plano. Configurada pelo admin em
 * config/plans: plano.caktoOfertas = { mensal, anual, fundador }.
 * O preço cobrado é o da oferta na Cakto; o admin mantém os dois iguais.
 */
function ofertaCakto(plano, periodo, fundador = false) {
  const o = (plano && plano.caktoOfertas) || {}
  const id = String((fundador ? o.fundador : o[periodoValido(periodo)]) || '').trim()
  return OFERTA_RE.test(id) ? id : null
}

/**
 * Qual plano uma oferta PAGA libera. É isto que decide o plano no webhook,
 * nunca o checkout que a pessoa abriu: pagar a oferta do Essencial com o
 * link do Premium dá Essencial. Oferta de Fundador = Premium mensal.
 */
function planoDaOferta(catalogo, ofertaId) {
  const id = String(ofertaId || '').trim()
  if (!OFERTA_RE.test(id) || !Array.isArray(catalogo)) return null
  for (const p of catalogo) {
    const o = (p && p.caktoOfertas) || {}
    for (const tipo of ['mensal', 'anual', 'fundador']) {
      if (String(o[tipo] || '').trim() === id) {
        return { planId: p.id, periodo: tipo === 'anual' ? 'anual' : 'mensal', fundador: tipo === 'fundador' }
      }
    }
  }
  return null
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

/**
 * Vet Fundador: Premium grátis até o vet concluir N atendimentos pelo app;
 * depois, o Premium mensal sai pelo preço travado por 12 meses. Ao bater a
 * meta, o plano ganha um vencimento de CARENCIA dias para o vet pagar: a
 * renovação abre na hora (JANELA_RENOVACAO_DIAS) e, sem pagamento, a tarefa
 * diária devolve ao Free como qualquer plano vencido.
 */
const FUNDADOR = { vagas: 30, visitasGratis: 3, preco: 29.9, mesesTravado: 12, carenciaDias: 5 }

/** O cliente tem 48h para confirmar; sem resposta, o atendimento vale. */
const CONFIRMACAO_AUTOMATICA_MS = 48 * 3600 * 1000
const STATUS_FINALIZADO = ['finalizado', 'done', 'completed', 'concluido']

function emMs(v) {
  if (v == null) return null
  if (v instanceof Date) return v.getTime()
  if (typeof v.toMillis === 'function') return v.toMillis()
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * O atendimento conta para o Vet Fundador? Finalizado e confirmado pelo
 * CLIENTE (ou 48h sem resposta dele). A marca "Recebi o pagamento" do vet
 * não entra na conta: quem está no período grátis ganharia deixando de marcar.
 */
function atendimentoConta(req, agora, desde = null) {
  if (!STATUS_FINALIZADO.includes(String(req && req.status || '').toLowerCase())) return false
  const fim = emMs(req.finalizedAt)
  // Só vale o que foi concluído DEPOIS de entrar no programa; senão quem já
  // tinha histórico batia a meta no primeiro dia.
  const inicio = emMs(desde)
  if (inicio != null && (emMs(req.finalizedAt || req.createdAt) ?? -Infinity) < inicio) return false
  if (req.confirmFinish_client === true) return true
  return fim != null && agora - fim >= CONFIRMACAO_AUTOMATICA_MS
}

/** Preço do Premium mensal travado do Fundador, ou null se não se aplica. */
function precoFundador({ usuario, planId, periodo, agora }) {
  const f = usuario && usuario.fundador
  if (!f || planId !== 'premium' || periodoValido(periodo) !== 'mensal') return null
  const fimDoTeste = emMs(usuario.fundadorTrialEndedAt)
  if (fimDoTeste == null) return null
  const meses = Number(f.mesesTravado || FUNDADOR.mesesTravado)
  return agora <= fimDoTeste + meses * 30 * 864e5 ? Number(f.price || FUNDADOR.preco) : null
}

module.exports = {
  FUNDADOR, CONFIRMACAO_AUTOMATICA_MS, atendimentoConta, precoFundador,
  JANELA_RENOVACAO_DIAS, podePagar,
  PLANOS_PADRAO, DIAS_POR_PERIODO, PLANOS_DESTAQUE, ORIGENS,
  planoDoCatalogo, periodoValido, valorEmCentavos, novaExpiracao,
  origemSegura, chaveProduto, pagamentoConfere,
  CARENCIA_ASSINATURA_DIAS, ofertaCakto, planoDaOferta,
}
