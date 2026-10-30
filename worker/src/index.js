/**
 * Servidor do AVANTE (Cloudflare Workers).
 *
 *   POST /checkout              link de pagamento da assinatura na Cakto
 *   POST /cupom                 aplica cupom (100% ativa o plano direto)
 *   POST /cpf                   nome e nascimento pelo CPF (apicpf)
 *   POST /fundador              entra no Vet Fundador (Premium grátis até 3 atendimentos)
 *   POST /ia                    assistente de IA (a chave da Groq fica aqui)
 *   POST /webhook/cakto         aviso da Cakto: pagamento, renovação, cancelamento, estorno
 *   cron diário                 conta os atendimentos dos Fundadores; planos vencidos voltam ao Free
 *
 * As regras de dinheiro moram em functions/pagamentos.js (testadas à parte).
 * O webhook só é aceito com a assinatura da Cakto, e o plano que ele libera
 * sai da oferta paga, conferida contra o catálogo (worker/src/cakto.js).
 */
import pg from '../../functions/pagamentos.js'
import cpfLib from '../../functions/cpf.js'
import { banco, usuarioDaRequisicao, ErroBanco } from './google.js'
import { Falha } from './falha.js'
import { catalogo, travaMesmoPlano, checkout, webhookCakto } from './cakto.js'
import { ia } from './ia.js'

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

async function cupom(env, db, eu, dados) {
  const plano = pg.planoDoCatalogo(await catalogo(db), String(dados.planId || ''))
  if (!plano) throw new Falha(404, 'nao-encontrado', 'Plano não encontrado.')
  const u = await travaMesmoPlano(db, eu.uid, plano.id)
  const c = await cupomValido(db, dados.code)
  if (!c) throw new Falha(404, 'nao-encontrado', 'Cupom inválido ou expirado.')
  // Desconto parcial: o preço é o da oferta na Cakto, então o desconto é
  // aplicado lá. O admin cria o MESMO código no painel da Cakto.
  if (c.discount < 100) return { activated: false, discount: c.discount, naCakto: true }

  const agora = new Date()
  const escritas = [
    db.escrita(`users/${eu.uid}`, {
      plan: plano.id,
      featured: pg.PLANOS_DESTAQUE.includes(plano.id),
      planActivatedAt: agora,
      planCoupon: c.code,
      planExpiresAt: c.dias ? new Date(agora.getTime() + c.dias * 864e5) : null,
      planProvedor: 'cupom',
      planAssinatura: null,
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

const ROTAS = { '/checkout': checkout, '/cupom': cupom, '/cpf': consultaCpf, '/fundador': fundador, '/ia': ia }

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (url.pathname === '/webhook/cakto' && req.method === 'POST') return webhookCakto(req, env, banco(env))

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
