/**
 * Pagamento dos planos pela Cakto (assinatura recorrente).
 *
 *   POST /checkout        devolve o link da oferta certa na Cakto
 *   POST /webhook/cakto   aviso da Cakto: pagamento, renovação, cancelamento, estorno
 *
 * Como a conta é encontrada: o checkout grava payments/cakto_ck_{código}
 * e abre pay.cakto.com.br/{oferta}?callback={código}; a Cakto devolve o
 * código no webhook. Na primeira compra a assinatura fica guardada em
 * assinaturasCakto/ (pelo id da assinatura e pelo e-mail, com hash), e as
 * renovações, que podem vir sem o código, são achadas por ali.
 *
 * O que decide o plano é a OFERTA paga (config/plans → caktoOfertas),
 * conferida contra o catálogo, nunca o que a pessoa escolheu na tela.
 * Cada pedido pago cria payments/cakto_{pedido} com a condição "ainda não
 * existe", no mesmo lote que estende o plano: aviso repetido não soma dias.
 */
import pg from '../../functions/pagamentos.js'
import { ErroBanco } from './google.js'
import { Falha } from './falha.js'

export async function catalogo(db) {
  return (await db.ler('config/plans'))?.dados?.plans || null
}

const vigente = u => !!u.planExpiresAt && new Date(u.planExpiresAt).getTime() > Date.now()

/**
 * Não deixa pagar (ou ativar por cupom) o plano que a conta já tem em vigor.
 * Renovar o mesmo plano só abre nos últimos dias antes de vencer. Com uma
 * assinatura da Cakto ativa, nada novo: ela continuaria cobrando junto.
 */
export async function travaMesmoPlano(db, uid, planoId) {
  const u = (await db.ler(`users/${uid}`))?.dados || {}
  if (u.planProvedor === 'cakto' && u.planAssinatura === 'ativa' && vigente(u)) {
    throw new Falha(409, 'ja-ativo',
      'Você já tem uma assinatura ativa, com renovação automática. Para trocar de plano, cancele a atual pelo e-mail de compra da Cakto e depois assine o novo.')
  }
  const r = pg.podePagar({ agora: Date.now(), planoAtual: u.plan, expiraAtual: u.planExpiresAt, planoNovo: planoId })
  if (r.ok) return u
  const ate = r.ate && r.ate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const msg = r.motivo === 'cedo'
    ? `Este já é o seu plano, válido até ${ate}. A renovação abre ${pg.JANELA_RENOVACAO_DIAS} dias antes de vencer.`
    : 'Este já é o seu plano e ele não tem vencimento.'
  throw new Falha(409, 'ja-ativo', msg)
}

/* ── Checkout ── */

export async function checkout(env, db, eu, dados) {
  const plano = pg.planoDoCatalogo(await catalogo(db), String(dados.planId || ''))
  if (!plano) throw new Falha(404, 'nao-encontrado', 'Plano não encontrado.')
  if (!(Number(plano.price) > 0)) throw new Falha(400, 'invalido', 'Este plano não exige pagamento.')
  const u = await travaMesmoPlano(db, eu.uid, plano.id)
  const periodo = pg.periodoValido(dados.period)

  // Vet Fundador que já bateu a meta: Premium mensal na oferta de preço travado.
  const fundador = pg.precoFundador({ usuario: u, planId: plano.id, periodo, agora: Date.now() }) != null
  const oferta = pg.ofertaCakto(plano, periodo, fundador)
  if (!oferta) {
    console.error('oferta da Cakto não configurada:', plano.id, periodo, fundador ? '(fundador)' : '')
    throw new Falha(503, 'indisponivel', 'O pagamento deste plano ainda não está disponível. Tente mais tarde.')
  }

  const codigo = crypto.randomUUID().replace(/-/g, '')
  await db.gravar(`payments/cakto_ck_${codigo}`, {
    uid: eu.uid, planId: plano.id, periodo, oferta, fundador,
    provedor: 'cakto', status: 'pendente', createdAt: new Date(),
  })
  const url = new URL(`https://pay.cakto.com.br/${encodeURIComponent(oferta)}`)
  url.searchParams.set('callback', codigo)
  return { url: url.toString() }
}

/* ── Origem do webhook ── */

const enc = new TextEncoder()
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

async function hmacSha256(segredo, texto) {
  const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', chave, enc.encode(texto)))
}

const sha256 = async texto => hex(await crypto.subtle.digest('SHA-256', enc.encode(texto)))

/** Comparação em tempo constante (não vaza quantos caracteres bateram). */
function iguais(a, b) {
  a = String(a); b = String(b)
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

const TOLERANCIA_S = 5 * 60

/**
 * Veio mesmo da Cakto? Assinatura no cabeçalho (HMAC-SHA256 de
 * "{timestamp}.{corpo cru}" com o segredo do webhook, até 5 min de
 * diferença) ou, no formato antigo sem cabeçalho, o segredo no corpo.
 */
export async function veioDaCakto({ corpo, cabecalhos, segredo, agora = Date.now() }) {
  if (!segredo) return false
  const assinatura = cabecalhos.get('X-Cakto-Signature')
  if (assinatura) {
    const ts = cabecalhos.get('X-Cakto-Timestamp')
    if (!/^\d{9,11}$/.test(ts || '') || Math.abs(agora / 1000 - Number(ts)) > TOLERANCIA_S) return false
    const esperado = `v1=${await hmacSha256(segredo, `${ts}.${corpo}`)}`
    return assinatura.split(',').some(a => iguais(a.trim(), esperado))
  }
  try {
    return iguais(JSON.parse(corpo)?.secret || '', segredo)
  } catch {
    return false
  }
}

/* ── De quem é o pedido ── */

const idSeguro = v => (/^[A-Za-z0-9_-]{1,100}$/.test(String(v ?? '')) ? String(v) : null)

/** Chaves que acham a assinatura nas renovações: id da assinatura e e-mail do comprador. */
async function chavesAssinatura(d) {
  const chaves = []
  const sub = idSeguro(d.subscription?.id)
  if (sub) chaves.push(`sub_${sub}`)
  const email = String(d.customer?.email || '').trim().toLowerCase()
  if (email) chaves.push(`email_${await sha256(email)}`)
  return chaves
}

/**
 * 1. o código do nosso checkout (callback); 2. a assinatura já conhecida;
 * 3. uma única conta com o e-mail do comprador (quem comprou pelo link
 * direto da Cakto, sem passar pelo app).
 */
async function contaDoPedido(db, d) {
  const codigo = String(d.callback || '').trim()
  if (/^[a-f0-9]{32}$/.test(codigo)) {
    const ck = await db.ler(`payments/cakto_ck_${codigo}`)
    if (ck?.dados?.uid) return { uid: ck.dados.uid, checkout: codigo }
  }
  for (const chave of await chavesAssinatura(d)) {
    const a = await db.ler(`assinaturasCakto/${chave}`)
    if (a?.dados?.uid) return { uid: a.dados.uid, checkout: null }
  }
  const email = String(d.customer?.email || '').trim()
  if (email) {
    const contas = await db.onde('users', { email })
    if (contas.length === 1) return { uid: contas[0].caminho.split('/')[1], checkout: null }
  }
  return null
}

/* ── Eventos ── */

/** Pedido pago (primeira compra ou renovação): estende o plano uma vez por pedido. */
async function aplicarPagamento(db, evento, d) {
  const pedido = idSeguro(d.id)
  if (!pedido) return 'sem-id'
  if (d.status && !['paid', 'approved'].includes(String(d.status).toLowerCase())) return 'nao-pago'
  if (await db.ler(`payments/cakto_${pedido}`)) return 'ja-aplicado'

  const oferta = String(d.offer?.id || '').trim()
  const alvo = pg.planoDaOferta(await catalogo(db), oferta)
  if (!alvo) {
    console.error('oferta paga não está em config/plans:', oferta, 'pedido', pedido)
    return 'oferta-desconhecida'   // 200: a Cakto não reenvia; dá para reenviar pelo painel depois de configurar
  }
  const conta = await contaDoPedido(db, d)
  if (!conta) {
    console.error('pedido sem conta no app:', pedido)
    return 'sem-conta'
  }
  const chaves = await chavesAssinatura(d)

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const lido = await db.ler(`users/${conta.uid}`)
    if (!lido) return 'sem-conta'
    const u = lido.dados
    const agora = new Date()
    const expira = pg.novaExpiracao({
      agora: agora.getTime(), expiraAtual: u.planExpiresAt || null,
      planoAtual: u.plan, planoNovo: alvo.planId, periodo: alvo.periodo,
      carenciaDias: pg.CARENCIA_ASSINATURA_DIAS,
    })
    const escritas = [
      db.escrita(`payments/cakto_${pedido}`, {
        uid: conta.uid, planId: alvo.planId, periodo: alvo.periodo, oferta, fundador: alvo.fundador,
        provedor: 'cakto', evento, status: 'pago',
        centavos: Math.round(Number(d.amount || 0) * 100),
        checkout: conta.checkout, pagoEm: agora, expiraEm: expira, createdAt: agora,
      }, { exists: false }),
      // Só grava se ninguém mexeu na conta desde a leitura (o vencimento sai dela).
      db.escrita(`users/${conta.uid}`, {
        plan: alvo.planId,
        featured: pg.PLANOS_DESTAQUE.includes(alvo.planId),
        planActivatedAt: agora,
        planExpiresAt: expira,
        planCheckoutId: `cakto_${pedido}`,
        planPeriodo: alvo.periodo,
        planProvedor: 'cakto',
        planAssinatura: 'ativa',
      }, { updateTime: lido.atualizadoEm }),
      ...chaves.map(c => db.escrita(`assinaturasCakto/${c}`, {
        uid: conta.uid, planId: alvo.planId, periodo: alvo.periodo, oferta, status: 'ativa', atualizadoEm: agora,
      })),
    ]
    if (conta.checkout) {
      escritas.push(db.escrita(`payments/cakto_ck_${conta.checkout}`, { status: 'pago', pedido }))
    }
    if (u.referredByUid) {
      escritas.push(db.escrita(`users/${u.referredByUid}/referrals/${conta.uid}`, {
        activatedPlan: alvo.planId, activatedAt: agora, viaCupom: null,
      }))
    }
    try {
      await db.commit(escritas)
      return 'ativado'
    } catch (e) {
      if (!(e instanceof ErroBanco) || ![400, 409].includes(e.status)) throw e
      // O pedido entrou por outro aviso ao mesmo tempo, ou a conta mudou: confere e tenta de novo.
      if (await db.ler(`payments/cakto_${pedido}`)) return 'ja-aplicado'
    }
  }
  throw new Error(`conta ${conta.uid} mudando sem parar`)
}

/** Reembolso ou chargeback: o pedido deixa de valer e, se é o que sustenta o plano, volta ao Free. */
async function estornar(db, evento, d) {
  const pedido = idSeguro(d.id)
  if (!pedido) return 'sem-id'
  const reg = await db.ler(`payments/cakto_${pedido}`)
  if (!reg) return 'desconhecido'
  const p = reg.dados
  const escritas = [db.escrita(`payments/cakto_${pedido}`, {
    status: evento === 'refund' ? 'estornado' : 'contestado', estornadoEm: new Date(),
  })]
  const u = (await db.ler(`users/${p.uid}`))?.dados || {}
  if (u.planCheckoutId === `cakto_${pedido}`) {
    escritas.push(db.escrita(`users/${p.uid}`, {
      plan: 'free', featured: false, planExpiresAt: new Date(), planAssinatura: 'encerrada',
    }))
  }
  await db.commit(escritas)
  return 'estornado'
}

const STATUS_ASSINATURA = {
  subscription_canceled: 'cancelada',
  subscription_renewal_refused: 'recusada',
  subscription_late: 'atrasada',
  subscription_paused: 'pausada',
  subscription_resumed: 'ativa',
}

/**
 * Mudança na assinatura sem pagamento. O plano NÃO cai na hora: vale até o
 * vencimento já pago, e a tarefa diária devolve ao Free se não renovar.
 */
async function mudarAssinatura(db, evento, d) {
  const status = STATUS_ASSINATURA[evento]
  const conta = await contaDoPedido(db, d)
  if (!conta) return 'sem-conta'
  const u = (await db.ler(`users/${conta.uid}`))?.dados || {}
  const escritas = (await chavesAssinatura(d)).map(c =>
    db.escrita(`assinaturasCakto/${c}`, { uid: conta.uid, status, atualizadoEm: new Date() }))
  if (u.planProvedor === 'cakto') escritas.push(db.escrita(`users/${conta.uid}`, { planAssinatura: status }))
  if (escritas.length) await db.commit(escritas)
  return `assinatura-${status}`
}

const PAGOS = ['purchase_approved', 'subscription_renewed', 'subscription_late_recovered']
const ESTORNOS = ['refund', 'chargeback']

export async function webhookCakto(req, env, db) {
  const corpo = await req.text()
  const ok = await veioDaCakto({ corpo, cabecalhos: req.headers, segredo: env.CAKTO_WEBHOOK_SECRET })
  if (!ok) return new Response('unauthorized', { status: 401 })

  let ev
  try { ev = JSON.parse(corpo) } catch { return new Response('json', { status: 400 }) }
  const evento = String(ev?.event || '')
  const d = ev?.data && typeof ev.data === 'object' ? ev.data : {}
  try {
    let resultado = 'ignorado'
    if (PAGOS.includes(evento)) resultado = await aplicarPagamento(db, evento, d)
    else if (ESTORNOS.includes(evento)) resultado = await estornar(db, evento, d)
    else if (STATUS_ASSINATURA[evento]) resultado = await mudarAssinatura(db, evento, d)

    // Auditoria. A Cakto reenvia se demorar mais de 8 s; o processamento é idempotente.
    const pedido = idSeguro(d.id)
    if (pedido && /^[a-z_]{1,40}$/.test(evento)) {
      await db.gravar(`payments_events/cakto_${evento}_${pedido}`, {
        provedor: 'cakto', tipo: evento, pedido, resultado, recebidoEm: new Date(),
      }).catch(() => {})
    }
    return new Response(resultado, { status: 200 })
  } catch (e) {
    // 500 faz a Cakto tentar de novo mais tarde.
    console.error('webhook cakto:', evento, e?.message)
    return new Response('erro', { status: 500 })
  }
}
