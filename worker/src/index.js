/**
 * Servidor do AVANTE (Cloudflare Workers).
 *
 *   POST /checkout              cria o pagamento (PIX ou cartão) na AbacatePay
 *   POST /cupom                 aplica cupom (100% ativa o plano direto)
 *   POST /cpf                   nome e nascimento pelo CPF (apicpf)
 *   POST /fundador              entra no Vet Fundador (Premium grátis até 3 atendimentos)
 *   POST /webhook/abacatepay    aviso de pagamento da AbacatePay
 *   cron diário                 conta os atendimentos dos Fundadores; planos vencidos voltam ao Free
 *
 * Mesma lógica das Cloud Functions (functions/index.js), que ficam como
 * alternativa caso o projeto vá para o plano Blaze. As regras de dinheiro
 * são as MESMAS: functions/pagamentos.js é importado daqui.
 *
 * O webhook é só um aviso: a confirmação vem de uma consulta à AbacatePay
 * com a nossa chave, comparada com o NOSSO registro do checkout. Webhook
 * forjado, checkout pendente ou valor menor que o plano não ativam nada.
 */
import pg from '../../functions/pagamentos.js'
import cpfLib from '../../functions/cpf.js'
import { banco, usuarioDaRequisicao, ErroBanco } from './google.js'

class Falha extends Error {
  constructor(status, codigo, mensagem) { super(mensagem); this.status = status; this.codigo = codigo }
}
const INDISPONIVEL = 'Não foi possível falar com o meio de pagamento. Tente de novo.'

/* ── CORS: só o app chama as rotas públicas ── */
function cabecalhosCors(req) {
  const origem = req.headers.get('Origin') || ''
  const permitida = pg.origemSegura(origem) === origem
  return {
    'Access-Control-Allow-Origin': permitida ? origem : pg.ORIGENS[0],
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}
const json = (corpo, status, cors) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...cors } })

/* ── AbacatePay ── */
async function abacate(env, metodo, caminho, corpo) {
  const base = env.ABACATEPAY_URL || 'https://api.abacatepay.com'
  let r
  try {
    r = await fetch(base + caminho, {
      method: metodo,
      headers: { Authorization: `Bearer ${env.ABACATEPAY_API_KEY}`, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(15000),
    })
  } catch (e) {
    console.error('abacatepay fora do ar:', caminho, e?.message)
    throw new Falha(503, 'indisponivel', INDISPONIVEL)
  }
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.success === false) {
    console.error('abacatepay', caminho, r.status, JSON.stringify(j).slice(0, 400))
    throw new Falha(503, 'indisponivel', INDISPONIVEL)
  }
  return j.data
}

async function catalogo(db) {
  return (await db.ler('config/plans'))?.dados?.plans || null
}

async function cupomValido(db, codigo) {
  const code = String(codigo || '').trim().toUpperCase()
  if (!code) return null
  const todos = (await db.ler('config/coupons'))?.dados || {}
  // Só cupons criados pelo admin. Havia um BEMVINDO fixo aqui que dava
  // Premium grátis e sem vencimento a quem digitasse: furava o Vet Fundador.
  const c = todos[code] || null
  if (!c || c.active === false) return null
  return { code, discount: Number(c.discount) || 0, dias: Number(c.dias) || null }
}

/** Produto da AbacatePay para plano/período/preço: criado uma vez e guardado. */
async function produtoDoPlano(env, db, plano, periodo, centavos) {
  const chave = pg.chaveProduto(plano.id, periodo, centavos)
  const campo = chave.replace(/-/g, '_')
  const cache = (await db.ler('config/abacatepayProdutos'))?.dados || {}
  if (cache[campo]) return cache[campo]
  const p = await abacate(env, 'POST', '/v2/products/create', {
    externalId: `${chave}-${Date.now().toString(36)}`,
    name: `AVANTE ${plano.name || plano.id} (${periodo})`,
    price: centavos,
    currency: 'BRL',
  })
  await db.gravar('config/abacatepayProdutos', { [campo]: p.id })
  return p.id
}

/** Cliente da AbacatePay, para o checkout vir preenchido. Opcional. */
async function clienteDaConta(env, db, uid, emailDoLogin) {
  const salvo = (await db.ler(`payments_customers/${uid}`))?.dados
  if (salvo?.id) return salvo.id
  const u = (await db.ler(`users/${uid}`))?.dados || {}
  const priv = (await db.ler(`users/${uid}/private/profile`))?.dados || {}
  const email = u.email || emailDoLogin
  if (!email) return null
  try {
    const c = await abacate(env, 'POST', '/v2/customers/create', {
      email,
      ...(u.name && { name: u.name }),
      ...(u.phone && { cellphone: u.phone }),
      ...(priv.cpf && { taxId: priv.cpf }),
    })
    await db.gravar(`payments_customers/${uid}`, { id: c.id, criadoEm: new Date() })
    return c.id
  } catch {
    return null   // sem cliente pré-cadastrado, o checkout pede os dados
  }
}

/* ── Rotas do app (exigem login) ── */

/**
 * Não deixa pagar (ou ativar por cupom) o plano que a conta já tem em vigor.
 * Renovar o mesmo plano só abre nos últimos dias antes de vencer.
 */
async function travaMesmoPlano(db, uid, planoId) {
  const u = (await db.ler(`users/${uid}`))?.dados || {}
  const r = pg.podePagar({ agora: Date.now(), planoAtual: u.plan, expiraAtual: u.planExpiresAt, planoNovo: planoId })
  if (r.ok) return u
  const ate = r.ate && r.ate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const msg = r.motivo === 'cedo'
    ? `Este já é o seu plano, válido até ${ate}. A renovação abre ${pg.JANELA_RENOVACAO_DIAS} dias antes de vencer.`
    : 'Este já é o seu plano e ele não tem vencimento.'
  throw new Falha(409, 'ja-ativo', msg)
}

async function checkout(env, db, eu, dados) {
  const plano = pg.planoDoCatalogo(await catalogo(db), String(dados.planId || ''))
  if (!plano) throw new Falha(404, 'nao-encontrado', 'Plano não encontrado.')
  if (!(Number(plano.price) > 0)) throw new Falha(400, 'invalido', 'Este plano não exige pagamento.')
  const u = await travaMesmoPlano(db, eu.uid, plano.id)
  const periodo = pg.periodoValido(dados.period)

  // Vet Fundador que já bateu a meta: Premium mensal pelo preço travado.
  // Nesse caso o cupom não soma: o preço de fundador já é o desconto.
  const precoFundador = pg.precoFundador({ usuario: u, planId: plano.id, periodo, agora: Date.now() })

  let cupom = null
  if (dados.coupon && precoFundador == null) {
    const c = await cupomValido(db, dados.coupon)
    if (!c) throw new Falha(404, 'nao-encontrado', 'Cupom inválido ou expirado.')
    if (c.discount < 100) cupom = c
  }
  const centavos = pg.valorEmCentavos(precoFundador ?? plano.price, periodo, cupom?.discount || 0)
  if (centavos < 100) throw new Falha(400, 'invalido', 'Valor abaixo do mínimo para pagamento.')

  const produtoId = await produtoDoPlano(env, db, plano, periodo, centavos)
  const clienteId = await clienteDaConta(env, db, eu.uid, eu.email)
  const origem = pg.origemSegura(dados.origin)
  const externalId = `avante:${eu.uid}:${plano.id}:${periodo}:${Date.now().toString(36)}`

  const ck = await abacate(env, 'POST', '/v2/checkouts/create', {
    items: [{ id: produtoId, quantity: 1 }],
    methods: ['PIX', 'CARD'],
    ...(clienteId && { customerId: clienteId }),
    externalId,
    returnUrl: `${origem}/plans`,
    completionUrl: `${origem}/plans?status=paid`,
    card: { maxInstallments: periodo === 'anual' ? 12 : 1 },
    metadata: { uid: eu.uid, planId: plano.id, periodo },
  })

  // O registro que o webhook vai conferir. Valor e plano saem DAQUI.
  await db.gravar(`payments/${ck.id}`, {
    uid: eu.uid, planId: plano.id, periodo, centavos,
    cupom: cupom?.code || null, fundador: precoFundador != null, externalId, status: 'pendente',
    devMode: !!ck.devMode, createdAt: new Date(),
  })
  return { url: ck.url }
}

/**
 * Entra no Vet Fundador: Premium grátis, sem vencimento, até a tarefa
 * diária contar os atendimentos da meta. As vagas ficam em config/fundador
 * ({ vagas, usados, fechaEm? }); o contador e o plano entram no MESMO
 * commit, com pré-condição, então duas entradas ao mesmo tempo não passam
 * da última vaga.
 */
async function fundador(env, db, eu) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const lido = await db.ler(`users/${eu.uid}`)
    const u = lido?.dados
    if (!u) throw new Falha(404, 'nao-encontrado', 'Conta não encontrada.')
    if (!['medico_veterinario', 'vet', 'professional'].includes(u.profession)) {
      throw new Falha(403, 'invalido', 'O Vet Fundador é para veterinários.')
    }
    if (u.fundador) return { ativo: true }

    const agora = new Date()
    const expira = u.planExpiresAt ? new Date(u.planExpiresAt).getTime() : 0
    if ((u.plan || 'free') !== 'free' && expira > agora.getTime()) {
      throw new Falha(409, 'ja-ativo', 'Você já tem um plano pago em vigor. O Vet Fundador é para quem ainda não assina.')
    }

    const cfg = await db.ler('config/fundador')
    const vagas = Number(cfg?.dados.vagas ?? pg.FUNDADOR.vagas)
    const usados = Number(cfg?.dados.usados ?? 0)
    const fecha = cfg?.dados.fechaEm ? new Date(cfg.dados.fechaEm).getTime() : null
    if (fecha && agora.getTime() > fecha) throw new Falha(409, 'encerrado', 'As inscrições de Vet Fundador já fecharam.')
    if (usados >= vagas) throw new Falha(409, 'esgotado', 'As vagas de Vet Fundador acabaram.')

    try {
      await db.commit([
        db.escrita('config/fundador', { vagas, usados: usados + 1 },
          cfg ? { updateTime: cfg.atualizadoEm } : { exists: false }),
        db.escrita(`users/${eu.uid}`, {
          plan: 'premium',
          featured: true,
          planActivatedAt: agora,
          planExpiresAt: null,
          planCoupon: 'FUNDADOR',
          paidVisits: 0,
          fundador: {
            desde: agora,
            trialVisits: pg.FUNDADOR.visitasGratis,
            price: pg.FUNDADOR.preco,
            mesesTravado: pg.FUNDADOR.mesesTravado,
          },
        }, { updateTime: lido.atualizadoEm }),
        db.escrita(`payments/fundador_${eu.uid}`, {
          uid: eu.uid, planId: 'premium', centavos: 0, status: 'fundador', createdAt: agora,
        }),
      ])
      return { ativo: true, vagasRestantes: vagas - usados - 1 }
    } catch (e) {
      // Alguém mexeu nas vagas ou na conta entre a leitura e a gravação: lê de novo.
      if (e instanceof ErroBanco && (e.status === 400 || e.status === 409)) continue
      throw e
    }
  }
  throw new Falha(409, 'erro', 'Muita gente entrando ao mesmo tempo. Tente de novo.')
}

async function cupom(env, db, eu, dados) {
  const plano = pg.planoDoCatalogo(await catalogo(db), String(dados.planId || ''))
  if (!plano) throw new Falha(404, 'nao-encontrado', 'Plano não encontrado.')
  const u = await travaMesmoPlano(db, eu.uid, plano.id)
  const c = await cupomValido(db, dados.code)
  if (!c) throw new Falha(404, 'nao-encontrado', 'Cupom inválido ou expirado.')
  if (c.discount < 100) return { activated: false, discount: c.discount }

  const agora = new Date()
  const escritas = [
    db.escrita(`users/${eu.uid}`, {
      plan: plano.id,
      featured: pg.PLANOS_DESTAQUE.includes(plano.id),
      planActivatedAt: agora,
      planCoupon: c.code,
      planExpiresAt: c.dias ? new Date(agora.getTime() + c.dias * 864e5) : null,
    }),
    db.escrita(`payments/cupom_${eu.uid}_${agora.getTime()}`, {
      uid: eu.uid, planId: plano.id, centavos: 0, cupom: c.code, status: 'cupom', createdAt: agora,
    }),
  ]
  if (u.referredByUid) {
    escritas.push(db.escrita(`users/${u.referredByUid}/referrals/${eu.uid}`, {
      activatedPlan: plano.id, activatedAt: agora, viaCupom: c.code,
    }))
  }
  await db.commit(escritas)
  return { activated: true, discount: 100 }
}

const CPF_POR_CONTA_DIA = 3
const CPF_TOTAL_DIA = 90

/** Conta a consulta de CPF do dia. Duas consultas ao mesmo tempo: uma perde e tenta de novo. */
async function cotaCpf(db, uid) {
  const hoje = new Date().toISOString().slice(0, 10)
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const conta = await db.ler(`cpfUsage/${uid}`)
    const total = await db.ler('cpfUsage/_total')
    const n = d => (d && d.dados.dia === hoje ? Number(d.dados.n || 0) : 0)
    if (n(conta) >= CPF_POR_CONTA_DIA || n(total) >= CPF_TOTAL_DIA) {
      throw new Falha(429, 'limite', 'Consulta indisponível agora. Preencha os dados à mão.')
    }
    const pre = d => (d ? { updateTime: d.atualizadoEm } : { exists: false })
    try {
      await db.commit([
        db.escrita(`cpfUsage/${uid}`, { dia: hoje, n: n(conta) + 1 }, pre(conta)),
        db.escrita('cpfUsage/_total', { dia: hoje, n: n(total) + 1 }, pre(total)),
      ])
      return
    } catch (e) {
      if (!(e instanceof ErroBanco) || ![400, 409].includes(e.status)) throw e
    }
  }
  throw new Falha(429, 'limite', 'Consulta indisponível agora. Preencha os dados à mão.')
}

async function consultaCpf(env, db, eu, dados) {
  const cpf = String(dados.cpf || '').replace(/\D/g, '')
  if (!cpfLib.cpfValido(cpf)) throw new Falha(400, 'invalido', 'CPF inválido.')
  const reserva = await db.ler(`cpfs/${cpfLib.hashCpf(cpf)}`)
  if (reserva && reserva.dados.uid !== eu.uid) return { jaCadastrado: true }
  if (!env.APICPF_KEY) throw new Falha(503, 'indisponivel', 'Consulta de CPF desligada.')

  await cotaCpf(db, eu.uid)
  let r
  try {
    r = await fetch(`${env.APICPF_URL || 'https://apicpf.com/api/consulta'}?cpf=${cpf}`, {
      headers: { 'X-API-KEY': env.APICPF_KEY }, signal: AbortSignal.timeout(8000),
    })
  } catch {
    throw new Falha(503, 'indisponivel', 'Consulta indisponível agora. Preencha os dados à mão.')
  }
  if (r.status === 404) return { encontrado: false }
  if (r.status === 429 || r.status === 402) throw new Falha(429, 'limite', 'Consulta indisponível agora. Preencha os dados à mão.')
  if (!r.ok) {
    console.error('apicpf respondeu', r.status)   // 401/403: chave errada ou vencida
    throw new Falha(503, 'indisponivel', 'Consulta indisponível agora. Preencha os dados à mão.')
  }
  const d = (await r.json())?.data || {}
  return {
    encontrado: true,
    nome: String(d.nome || '').slice(0, 120),
    nascimento: /^\d{4}-\d{2}-\d{2}$/.test(d.data_nascimento || '') ? d.data_nascimento : null,
  }
}

/* ── Webhook ── */
async function confirmarCheckout(env, db, checkoutId) {
  if (!checkoutId) return 'sem-id'
  const reg = await db.ler(`payments/${checkoutId}`)
  if (!reg) { console.warn('checkout desconhecido:', checkoutId); return 'desconhecido' }
  const p = reg.dados
  if (p.status === 'pago') return 'ja-aplicado'

  // A verdade vem da AbacatePay, com a nossa chave, não do corpo do webhook.
  const ck = await abacate(env, 'GET', `/v2/checkouts/get?id=${encodeURIComponent(checkoutId)}`)
  const confere = pg.pagamentoConfere(ck, p)
  if (!confere.ok) {
    console.error('pagamento não confere:', checkoutId, confere.motivo)
    await db.gravar(`payments/${checkoutId}`, { status: 'nao_confere', motivo: confere.motivo })
    return 'nao-confere'
  }

  const u = (await db.ler(`users/${p.uid}`))?.dados || {}
  const agora = new Date()
  const expira = pg.novaExpiracao({
    agora: agora.getTime(), expiraAtual: u.planExpiresAt || null,
    planoAtual: u.plan, planoNovo: p.planId, periodo: p.periodo,
  })
  const escritas = [
    // Só aplica se ninguém mudou o pagamento desde a leitura: dois avisos
    // simultâneos não ativam o plano duas vezes.
    db.escrita(`payments/${checkoutId}`, { status: 'pago', pagoEm: agora, expiraEm: expira },
      { updateTime: reg.atualizadoEm }),
    db.escrita(`users/${p.uid}`, {
      plan: p.planId,
      featured: pg.PLANOS_DESTAQUE.includes(p.planId),
      planActivatedAt: agora,
      planExpiresAt: expira,
      planCheckoutId: checkoutId,
      planPeriodo: p.periodo,
    }),
  ]
  if (u.referredByUid) {
    escritas.push(db.escrita(`users/${u.referredByUid}/referrals/${p.uid}`, {
      activatedPlan: p.planId, activatedAt: agora, viaCupom: p.cupom || null,
    }))
  }
  try {
    await db.commit(escritas)
  } catch (e) {
    const agoraReg = await db.ler(`payments/${checkoutId}`)
    if (agoraReg?.dados?.status === 'pago') return 'ja-aplicado'
    throw e
  }
  return 'ativado'
}

async function estornar(db, checkoutId, tipo) {
  if (!checkoutId) return 'sem-id'
  const reg = await db.ler(`payments/${checkoutId}`)
  if (!reg) return 'desconhecido'
  const p = reg.dados
  const escritas = [db.escrita(`payments/${checkoutId}`, { status: tipo === 'checkout.refunded' ? 'estornado' : 'contestado' })]
  const u = (await db.ler(`users/${p.uid}`))?.dados || {}
  if (u.planCheckoutId === checkoutId) {
    escritas.push(db.escrita(`users/${p.uid}`, { plan: 'free', featured: false, planExpiresAt: new Date() }))
  }
  await db.commit(escritas)
  return 'estornado'
}

async function webhook(req, env, db) {
  const url = new URL(req.url)
  if (!env.ABACATEPAY_WEBHOOK_SECRET || url.searchParams.get('webhookSecret') !== env.ABACATEPAY_WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }
  const ev = await req.json().catch(() => ({}))
  const tipo = String(ev.event || '')
  const id = ev.data?.checkout?.id
  try {
    let resultado = 'ignorado'
    if (tipo === 'checkout.completed') resultado = await confirmarCheckout(env, db, id)
    else if (tipo === 'checkout.refunded' || tipo === 'checkout.disputed') resultado = await estornar(db, id, tipo)
    // Auditoria. A AbacatePay reenvia até 7 vezes; o processamento é idempotente.
    if (ev.id) {
      await db.gravar(`payments_events/${String(ev.id).replace(/\//g, '_')}`, {
        tipo, checkoutId: id || null, resultado, devMode: !!ev.devMode, recebidoEm: new Date(),
      }).catch(() => {})
    }
    return new Response(resultado, { status: 200 })
  } catch (e) {
    // 500 faz a AbacatePay tentar de novo mais tarde.
    console.error('webhook:', e?.message)
    return new Response('erro', { status: 500 })
  }
}

/* ── Tarefa diária ── */

/**
 * Conta os atendimentos de cada Vet Fundador ainda no período grátis.
 * Na meta, encerra o período: o plano ganha um vencimento curto (carência)
 * para o vet pagar o preço travado; sem pagamento, expirarPlanos devolve
 * ao Free como qualquer plano vencido.
 */
async function contarFundadores(env) {
  const db = banco(env)
  const agora = Date.now()
  const fundadores = await db.onde('users', { planCoupon: 'FUNDADOR' })
  let encerrados = 0
  for (const f of fundadores) {
    const u = f.dados
    if (!u.fundador || u.fundadorTrialEndedAt) continue
    const uid = f.caminho.split('/')[1]
    const pedidos = await db.onde('requests', { professionalId: uid })
    const feitos = pedidos.filter(p => pg.atendimentoConta(p.dados, agora, u.fundador.desde)).length
    const meta = Number(u.fundador.trialVisits || pg.FUNDADOR.visitasGratis)
    const campos = { paidVisits: feitos }
    if (feitos >= meta) {
      campos.fundadorTrialEndedAt = new Date(agora)
      campos.planExpiresAt = new Date(agora + pg.FUNDADOR.carenciaDias * 864e5)
      encerrados++
    }
    if (feitos !== u.paidVisits || campos.fundadorTrialEndedAt) await db.gravar(f.caminho, campos)
  }
  console.log(`${fundadores.length} Fundador(es) contado(s); ${encerrados} terminaram o período grátis.`)
  return encerrados
}

async function expirarPlanos(env) {
  const db = banco(env)
  const vencidos = await db.ateData('users', 'planExpiresAt', new Date())
  const escritas = vencidos
    .filter(d => (d.dados.plan || 'free') !== 'free')
    .map(d => db.escrita(d.caminho, { plan: 'free', featured: false, planExpiredAt: new Date() }))
  for (let i = 0; i < escritas.length; i += 400) await db.commit(escritas.slice(i, i + 400))
  console.log(`${escritas.length} plano(s) vencido(s) voltaram ao Free.`)
  return escritas.length
}

const ROTAS = { '/checkout': checkout, '/cupom': cupom, '/cpf': consultaCpf, '/fundador': fundador }

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (url.pathname === '/webhook/abacatepay' && req.method === 'POST') return webhook(req, env, banco(env))

    const cors = cabecalhosCors(req)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const rota = ROTAS[url.pathname]
    if (!rota || req.method !== 'POST') return json({ erro: 'rota' }, 404, cors)

    try {
      const eu = await usuarioDaRequisicao(req, env)
      if (!eu) throw new Falha(401, 'login', 'Login necessário.')
      const dados = await req.json().catch(() => ({}))
      return json(await rota(env, banco(env), eu, dados || {}), 200, cors)
    } catch (e) {
      if (e instanceof Falha) return json({ erro: e.codigo, mensagem: e.message }, e.status, cors)
      console.error(url.pathname, e?.message)
      return json({ erro: 'erro', mensagem: 'Erro no servidor. Tente de novo.' }, 500, cors)
    }
  },

  async scheduled(evento, env, ctx) {
    // Primeiro conta os Fundadores (pode dar vencimento a quem bateu a meta),
    // depois expira. Uma falha na contagem não segura a expiração.
    ctx.waitUntil((async () => {
      await contarFundadores(env).catch(e => console.error('fundadores:', e?.message))
      await expirarPlanos(env)
    })())
  },
}
