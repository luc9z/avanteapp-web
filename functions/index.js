/**
 * Cloud Functions do Avante.
 *
 * askAI — proxy seguro para o Google Gemini.
 *   - A chave fica no Secret Manager (GEMINI_API_KEY), NUNCA no bundle.
 *   - Exige usuário autenticado.
 *   - Os prompts de sistema vivem AQUI, no servidor: o cliente só
 *     escolhe um `mode` pré-definido. Assim ninguém consegue apontar a
 *     nossa cota para outra tarefa qualquer.
 *   - Teto diário por usuário (anti-abuso de custo).
 *
 * Deploy:
 *   cd functions && npm install
 *   firebase functions:secrets:set GEMINI_API_KEY
 *   firebase deploy --only functions
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')

const MODEL = 'gemini-3.6-flash'
const MAX_MESSAGES = 12
const MAX_CHARS_PER_MESSAGE = 1500
const DAILY_LIMIT = 60          // chamadas por usuário por dia

/** Remove quebras e caracteres de controle de texto vindo do cliente,
 *  para que contexto não vire injeção de prompt. */
function clean(value, max = 120) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/* ── Prompts de sistema (server-side) ───────────────────────────── */
function clientPrompt(ctx) {
  const vets = Array.isArray(ctx.vets) ? ctx.vets.slice(0, 4) : []
  const list = vets.length
    ? `\n\nVeterinários disponíveis:\n${vets
        .map(v => `- ${clean(v.name, 60)}${v.featured ? ' ⭐ Destaque' : ''}${v.online ? ' 🟢' : ''} — ${clean(v.specialties, 80)}`)
        .join('\n')}`
    : ''

  return `Você é a triagem do AvanteApp (veterinária a domicílio, Brasil).

REGRAS:
- Máx 2-3 frases curtas. Direto e prático.
- Dúvidas gerais (vacinas, alimentação, comportamento, rotina): responda direto, SEM sugerir agendamento.
- Sintomas físicos agudos, dor, ferida, emergência, piora repentina, ou pedido de agendamento: oriente e inclua [SUGGEST_BOOKING] no fim.
- Se incluir [SUGGEST_BOOKING]: mencione UM veterinário pelo nome.
- Ao escolher o nome, dê PREFERÊNCIA ao que tem ⭐ Destaque. Só escolha outro se o Destaque claramente não atender a espécie/caso.
- PROIBIDO: "é fundamental que", "é importante que", discursos longos.
- Responda em português informal.${list}`
}

function vetPrompt(ctx) {
  const areas = ctx.specialties ? `\nÁreas de atuação do profissional: ${clean(ctx.specialties, 200)}.` : ''
  const agenda = Number(ctx.todayCount) > 0
    ? `\nHoje ele tem ${Math.min(Number(ctx.todayCount), 99)} atendimento(s) em andamento ou agendado(s).`
    : ''

  return `Você é copiloto clínico de um MÉDICO VETERINÁRIO brasileiro dentro do app Avante.
Seu interlocutor é um profissional formado — fale tecnicamente, sem simplificar como faria para um tutor.${areas}${agenda}

REGRAS:
- Seja direto e objetivo. Use listas curtas quando ajudar.
- Doses: sempre em mg/kg, com via, intervalo e duração. Diga a espécie a que se aplica.
- Aponte contraindicações e interações relevantes quando houver risco real.
- Diagnóstico diferencial: liste as hipóteses mais prováveis primeiro e diga qual exame diferencia cada uma.
- Se faltar dado essencial (peso, espécie, idade), PERGUNTE antes de responder.
- Nunca invente valores. Se não tiver certeza de uma dose, diga que precisa ser confirmada em bula/formulário.
- Feche respostas com doses ou protocolos com: "Confira sempre a bula e o seu julgamento clínico."
- Responda em português técnico do Brasil.`
}

const TRIAGE_PROMPT = `Você é um assistente de triagem veterinária. Responda SEMPRE em JSON válido com os campos:
- urgency: "imediata" | "alta" | "media" | "baixa"
- specialty: especialidade veterinária mais adequada (1-3 palavras)
- summary: resumo clínico em 1 frase para o veterinário
- advice: orientação breve para o tutor enquanto aguarda (1-2 frases)
Responda APENAS o JSON, sem markdown.`

const MODES = {
  client: { build: clientPrompt, maxTokens: 700,  temperature: 0.4, json: false },
  vet:    { build: vetPrompt,    maxTokens: 1200, temperature: 0.3, json: false },
  triage: { build: () => TRIAGE_PROMPT, maxTokens: 800, temperature: 0.3, json: true },
}

/** Conta as chamadas do dia e barra quem passar do teto. */
async function checkQuota(uid) {
  const { getFirestore } = require('firebase-admin/firestore')
  const db = getFirestore()
  const ref = db.doc(`aiUsage/${uid}`)
  const today = new Date().toISOString().slice(0, 10)

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const d = snap.exists ? snap.data() : {}
    const count = d.day === today ? Number(d.count || 0) : 0
    if (count >= DAILY_LIMIT) {
      throw new HttpsError('resource-exhausted',
        'Você atingiu o limite de uso da IA por hoje. Tente novamente amanhã.')
    }
    tx.set(ref, { day: today, count: count + 1 }, { merge: true })
  })
}

exports.askAI = onCall(
  {
    region: 'southamerica-east1',
    secrets: [GEMINI_API_KEY],
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login necessário.')
    }

    const cfg = MODES[request.data?.mode]
    if (!cfg) throw new HttpsError('invalid-argument', 'Modo de IA inválido.')

    const messages = Array.isArray(request.data?.messages) ? request.data.messages : []
    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      throw new HttpsError('invalid-argument', 'Histórico de mensagens inválido.')
    }

    await checkQuota(request.auth.uid)

    const contents = messages.map((m) => {
      const text = String(m?.content || '').slice(0, MAX_CHARS_PER_MESSAGE)
      if (!text) throw new HttpsError('invalid-argument', 'Mensagem vazia.')
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text }],
      }
    })

    const body = {
      systemInstruction: { parts: [{ text: cfg.build(request.data?.context || {}) }] },
      contents,
      generationConfig: {
        maxOutputTokens: cfg.maxTokens,
        temperature: cfg.temperature,
        // O Gemini 3.x raciocina antes de responder e esse raciocínio
        // consome o mesmo orçamento de saída — 'low' deixa espaço para
        // a resposta e reduz a latência.
        thinkingConfig: { thinkingLevel: 'low' },
        ...(cfg.json ? { responseMimeType: 'application/json' } : {}),
      },
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY.value()}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    )

    if (!res.ok) {
      console.error('Gemini error', res.status, await res.text().catch(() => ''))
      throw new HttpsError('unavailable', 'Assistente indisponível no momento.')
    }

    const data = await res.json()
    const candidate = data?.candidates?.[0]
    const text = (candidate?.content?.parts || [])
      .filter(p => !p.thought)          // descarta o raciocínio interno
      .map(p => p.text)
      .filter(Boolean)
      .join('')
      .trim()

    if (!text) {
      if (candidate?.finishReason === 'SAFETY') {
        throw new HttpsError('failed-precondition', 'A IA não pôde responder isso. Reformule a pergunta.')
      }
      throw new HttpsError('unavailable', 'Não consegui responder agora. Tente novamente.')
    }

    return { text }
  }
)

/**
 * onRatingCreated — mantém a média de avaliações do profissional.
 * Roda no servidor para que nenhum cliente possa manipular
 * averageRating/ratingCount diretamente (bloqueado no firestore.rules).
 */
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

initializeApp()

exports.onRatingCreated = onDocumentCreated(
  { region: 'southamerica-east1', document: 'users/{professionalId}/ratings/{requestId}' },
  async (event) => {
    const rating = Number(event.data?.data()?.rating)
    if (!rating || rating < 1 || rating > 5) return

    const db = getFirestore()
    const userRef = db.doc(`users/${event.params.professionalId}`)

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef)
      const d = snap.exists ? snap.data() : {}
      const count = Number(d.ratingCount || 0)
      const avg = Number(d.averageRating || 0)
      const newCount = count + 1
      const newAvg = (avg * count + rating) / newCount
      tx.set(userRef, {
        ratingCount: newCount,
        averageRating: Math.round(newAvg * 100) / 100,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    })
  }
)

/* ════════════════════════════════════════════════════════════════
   NOTIFICAÇÕES PUSH (FCM)
   ════════════════════════════════════════════════════════════════ */
const { onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { getMessaging } = require('firebase-admin/messaging')

async function sendPushTo(uid, title, body, url) {
  const db = getFirestore()
  const snap = await db.doc(`users/${uid}/private/push`).get()
  const tokens = snap.exists ? (snap.data().tokens || []) : []
  if (tokens.length === 0) return

  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { url: url || '/' },
    webpush: {
      notification: { icon: '/images/avante_logo.png' },
      fcmOptions: { link: url || '/' },
    },
  })

  // Remove tokens inválidos (app desinstalado, permissão revogada)
  const dead = []
  res.responses.forEach((r, i) => {
    const code = r.error?.code || ''
    if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
      dead.push(tokens[i])
    }
  })
  if (dead.length > 0) {
    await db.doc(`users/${uid}/private/push`).set(
      { tokens: FieldValue.arrayRemove(...dead) }, { merge: true }
    ).catch(() => {})
  }
}

/** Novo pedido → notifica o veterinário na hora. */
exports.onRequestCreated = onDocumentCreated(
  { region: 'southamerica-east1', document: 'requests/{requestId}' },
  async (event) => {
    const r = event.data?.data()
    if (!r?.professionalId) return
    const urgent = r.urgency === 'urgent'
    await sendPushTo(
      r.professionalId,
      urgent ? '🚨 Solicitação URGENTE' : 'Nova solicitação',
      `${r.clientName || 'Um cliente'} solicitou ${r.service || 'atendimento'}.`,
      `/request/${event.params.requestId}`
    ).catch((e) => console.error('push onRequestCreated:', e))
  }
)

/** Nova mensagem no chat → notifica o outro participante. */
exports.onChatMessageCreated = onDocumentCreated(
  { region: 'southamerica-east1', document: 'chats/{chatId}/messages/{msgId}' },
  async (event) => {
    const msg = event.data?.data()
    if (!msg?.senderId) return

    const db = getFirestore()
    const chatSnap = await db.doc(`chats/${event.params.chatId}`).get()
    if (!chatSnap.exists) return
    const c = chatSnap.data()

    // Destinatário = o participante que NÃO enviou a mensagem
    const recipient = msg.senderId === c.clientId ? c.professionalId
      : msg.senderId === c.professionalId ? c.clientId
      : (c.participants || []).find((p) => p !== msg.senderId)
    if (!recipient) return

    const preview = msg.type === 'location' ? '📍 Localização' : (msg.content || 'Nova mensagem')
    await sendPushTo(
      recipient,
      msg.senderName || 'Nova mensagem',
      preview.slice(0, 120),
      `/chat/${event.params.chatId}`
    ).catch((e) => console.error('push onChatMessageCreated:', e))
  }
)

/** Status mudou → notifica o cliente (aceito / a caminho / finalizado). */
exports.onRequestStatusChanged = onDocumentUpdated(
  { region: 'southamerica-east1', document: 'requests/{requestId}' },
  async (event) => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()
    if (!after?.clientId || before?.status === after?.status) return

    const MESSAGES = {
      aceito: ['Solicitação aceita ✅', `${after.professionalName || 'O veterinário'} aceitou seu pedido.`],
      a_caminho: ['Veterinário a caminho 🚗', `${after.professionalName || 'O profissional'} está indo até você.`],
      finalizado: ['Atendimento finalizado', 'Confirme a conclusão e avalie o atendimento.'],
      rejeitado: ['Solicitação não aceita', 'O profissional não pôde atender desta vez. Busque outro veterinário disponível.'],
    }
    const m = MESSAGES[(after.status || '').toLowerCase()]
    if (!m) return
    await sendPushTo(after.clientId, m[0], m[1], `/request/${event.params.requestId}`)
      .catch((e) => console.error('push onStatusChanged:', e))
  }
)

/* ════════════════════════════════════════════════════════════════
   PLANOS + ABACATEPAY (API v2: PIX e cartão)

   - Checkout com PIX e cartão. Mensal libera 30 dias, anual 365 (anual
     em até 12x no cartão). PIX não renova sozinho; o plano tem data de
     vencimento (planExpiresAt) e expirarPlanos devolve ao Free.
   - O webhook é só um AVISO. Quem confirma o pagamento é uma consulta à
     AbacatePay com a nossa chave, comparada com o NOSSO registro do
     checkout (valor, plano, conta). Webhook forjado não ativa plano.
   - Plano pago só é gravado aqui (as regras do Firestore impedem o
     próprio usuário de se dar um plano).

   Publicar (depois de ativar o plano Blaze):
     firebase functions:secrets:set ABACATEPAY_API_KEY
     firebase functions:secrets:set ABACATEPAY_WEBHOOK_SECRET
     firebase deploy --only functions:createPlanCheckout,functions:abacatepayWebhook,functions:redeemCoupon,functions:expirarPlanos

   Webhook no painel AbacatePay (eventos checkout.*):
     https://southamerica-east1-avante-pro.cloudfunctions.net/abacatepayWebhook?webhookSecret=<SECRET>
   ════════════════════════════════════════════════════════════════ */
const { onRequest } = require('firebase-functions/v2/https')
const pg = require('./pagamentos')

const ABACATEPAY_API_KEY = defineSecret('ABACATEPAY_API_KEY')
const ABACATEPAY_WEBHOOK_SECRET = defineSecret('ABACATEPAY_WEBHOOK_SECRET')
// Só o emulador local define ABACATEPAY_URL (uma API falsa para teste).
const ABACATEPAY_URL = process.env.ABACATEPAY_URL || 'https://api.abacatepay.com'

/** Chamada à AbacatePay. Erro vira mensagem genérica para o app e log completo aqui. */
async function abacate(metodo, caminho, corpo) {
  let r
  try {
    r = await fetch(ABACATEPAY_URL + caminho, {
      method: metodo,
      headers: { Authorization: `Bearer ${ABACATEPAY_API_KEY.value()}`, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(15000),
    })
  } catch (e) {
    console.error('abacatepay fora do ar:', caminho, e?.message)
    throw new HttpsError('unavailable', 'Não foi possível falar com o meio de pagamento. Tente de novo.')
  }
  const json = await r.json().catch(() => ({}))
  if (!r.ok || json.success === false) {
    console.error('abacatepay', caminho, r.status, JSON.stringify(json).slice(0, 400))
    throw new HttpsError('unavailable', 'Não foi possível falar com o meio de pagamento. Tente de novo.')
  }
  return json.data
}

/** Produto da AbacatePay para este plano/período/preço, criado uma vez e guardado. */
async function produtoDoPlano(db, plano, periodo, centavos) {
  const chave = pg.chaveProduto(plano.id, periodo, centavos)
  const cacheRef = db.doc('config/abacatepayProdutos')
  const cache = (await cacheRef.get()).data() || {}
  if (cache[chave]) return cache[chave]
  const p = await abacate('POST', '/v2/products/create', {
    // Sufixo de tempo: se o cache se perder, não colide com o externalId antigo.
    externalId: `${chave}-${Date.now().toString(36)}`,
    name: `AVANTE ${plano.name} (${periodo})`,
    price: centavos,
    currency: 'BRL',
  })
  await cacheRef.set({ [chave]: p.id }, { merge: true })
  return p.id
}

/** Cliente da AbacatePay da conta, para o checkout já vir preenchido. Opcional. */
async function clienteDaConta(db, uid, emailDoLogin) {
  const ref = db.doc(`payments_customers/${uid}`)
  const salvo = (await ref.get()).data()
  if (salvo?.id) return salvo.id
  const u = (await db.doc(`users/${uid}`).get()).data() || {}
  const priv = (await db.doc(`users/${uid}/private/profile`).get()).data() || {}
  const email = u.email || emailDoLogin
  if (!email) return null
  try {
    const c = await abacate('POST', '/v2/customers/create', {
      email,
      ...(u.name && { name: u.name }),
      ...(u.phone && { cellphone: u.phone }),
      ...(priv.cpf && { taxId: priv.cpf }),
    })
    await ref.set({ id: c.id, criadoEm: FieldValue.serverTimestamp() })
    return c.id
  } catch {
    return null   // sem cliente pré-cadastrado, o checkout pede os dados
  }
}

/** Cupom ativo de config/coupons (BEMVINDO existe por padrão). */
async function cupomValido(db, codigo) {
  const code = String(codigo || '').trim().toUpperCase()
  if (!code) return null
  const todos = (await db.doc('config/coupons').get()).data() || {}
  const c = todos[code] || (code === 'BEMVINDO' ? { discount: 100, active: true } : null)
  if (!c || c.active === false) return null
  return { code, discount: Number(c.discount) || 0, dias: Number(c.dias) || null }
}

exports.createPlanCheckout = onCall(
  { region: 'southamerica-east1', secrets: [ABACATEPAY_API_KEY], maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.')
    const uid = request.auth.uid
    const db = getFirestore()

    const catalogo = (await db.doc('config/plans').get()).data()?.plans
    const plano = pg.planoDoCatalogo(catalogo, String(request.data?.planId || ''))
    if (!plano) throw new HttpsError('not-found', 'Plano não encontrado.')
    if (!(Number(plano.price) > 0)) throw new HttpsError('invalid-argument', 'Este plano não exige pagamento.')
    const periodo = pg.periodoValido(request.data?.period)

    // Cupom de desconto PARCIAL entra no preço aqui. 100% não passa pelo
    // checkout: é o redeemCoupon que ativa.
    let cupom = null
    if (request.data?.coupon) {
      const c = await cupomValido(db, request.data.coupon)
      if (!c) throw new HttpsError('not-found', 'Cupom inválido ou expirado.')
      if (c.discount < 100) cupom = c
    }
    const centavos = pg.valorEmCentavos(plano.price, periodo, cupom?.discount || 0)
    if (centavos < 100) throw new HttpsError('invalid-argument', 'Valor abaixo do mínimo para pagamento.')

    const produtoId = await produtoDoPlano(db, plano, periodo, centavos)
    const clienteId = await clienteDaConta(db, uid, request.auth.token.email)
    const origem = pg.origemSegura(request.data?.origin)
    const externalId = `avante:${uid}:${plano.id}:${periodo}:${Date.now().toString(36)}`

    const ck = await abacate('POST', '/v2/checkouts/create', {
      items: [{ id: produtoId, quantity: 1 }],
      methods: ['PIX', 'CARD'],
      ...(clienteId && { customerId: clienteId }),
      externalId,
      returnUrl: `${origem}/plans`,
      completionUrl: `${origem}/plans?status=paid`,
      card: { maxInstallments: periodo === 'anual' ? 12 : 1 },
      metadata: { uid, planId: plano.id, periodo },
    })

    // O registro que o webhook vai conferir. Valor e plano saem DAQUI.
    await db.doc(`payments/${ck.id}`).set({
      uid, planId: plano.id, periodo, centavos,
      cupom: cupom?.code || null,
      externalId, status: 'pendente', devMode: !!ck.devMode,
      createdAt: FieldValue.serverTimestamp(),
    })
    return { url: ck.url }
  }
)

/** Pagamento confirmado: ativa o plano, uma vez só, e credita a indicação. */
async function confirmarCheckout(db, checkoutId) {
  if (!checkoutId) return 'sem-id'
  const ref = db.doc(`payments/${checkoutId}`)
  const reg = await ref.get()
  if (!reg.exists) { console.warn('checkout desconhecido:', checkoutId); return 'desconhecido' }
  const p = reg.data()
  if (p.status === 'pago') return 'ja-aplicado'

  // A verdade vem da AbacatePay, com a nossa chave, não do corpo do webhook.
  const ck = await abacate('GET', `/v2/checkouts/get?id=${encodeURIComponent(checkoutId)}`)
  const confere = pg.pagamentoConfere(ck, p)
  if (!confere.ok) {
    console.error('pagamento não confere:', checkoutId, confere.motivo)
    await ref.set({ status: 'nao_confere', motivo: confere.motivo }, { merge: true })
    return 'nao-confere'
  }

  return db.runTransaction(async (tx) => {
    const atual = await tx.get(ref)
    if (atual.data().status === 'pago') return 'ja-aplicado'   // dois webhooks ao mesmo tempo
    const uref = db.doc(`users/${p.uid}`)
    const u = (await tx.get(uref)).data() || {}
    const expira = pg.novaExpiracao({
      agora: Date.now(),
      expiraAtual: u.planExpiresAt?.toDate?.() || null,
      planoAtual: u.plan, planoNovo: p.planId, periodo: p.periodo,
    })
    tx.set(uref, {
      plan: p.planId,
      featured: pg.PLANOS_DESTAQUE.includes(p.planId),
      planActivatedAt: FieldValue.serverTimestamp(),
      planExpiresAt: expira,
      planCheckoutId: checkoutId,
      planPeriodo: p.periodo,
    }, { merge: true })
    tx.set(ref, { status: 'pago', pagoEm: FieldValue.serverTimestamp(), expiraEm: expira }, { merge: true })
    if (u.referredByUid) {
      tx.set(db.doc(`users/${u.referredByUid}/referrals/${p.uid}`), {
        activatedPlan: p.planId, activatedAt: FieldValue.serverTimestamp(), viaCupom: p.cupom || null,
      }, { merge: true })
    }
    return 'ativado'
  })
}

/** Estorno ou contestação: se é o pagamento do plano em vigor, volta ao Free. */
async function estornar(db, checkoutId, tipo) {
  if (!checkoutId) return 'sem-id'
  const ref = db.doc(`payments/${checkoutId}`)
  const reg = await ref.get()
  if (!reg.exists) return 'desconhecido'
  const p = reg.data()
  await ref.set({ status: tipo === 'checkout.refunded' ? 'estornado' : 'contestado' }, { merge: true })
  const uref = db.doc(`users/${p.uid}`)
  const u = (await uref.get()).data() || {}
  if (u.planCheckoutId === checkoutId) {
    await uref.set({ plan: 'free', featured: false, planExpiresAt: new Date() }, { merge: true })
  }
  return 'estornado'
}

exports.abacatepayWebhook = onRequest(
  { region: 'southamerica-east1', secrets: [ABACATEPAY_API_KEY, ABACATEPAY_WEBHOOK_SECRET], maxInstances: 3 },
  async (req, res) => {
    try {
      if (req.method !== 'POST') return res.status(405).send('method')
      if (req.query.webhookSecret !== ABACATEPAY_WEBHOOK_SECRET.value()) {
        return res.status(401).send('unauthorized')
      }
      const ev = req.body || {}
      const tipo = String(ev.event || '')
      const id = ev.data?.checkout?.id
      const db = getFirestore()

      let resultado = 'ignorado'
      if (tipo === 'checkout.completed') resultado = await confirmarCheckout(db, id)
      else if (tipo === 'checkout.refunded' || tipo === 'checkout.disputed') resultado = await estornar(db, id, tipo)

      // Auditoria. A mesma notificação pode chegar até 7 vezes; o
      // processamento acima é idempotente (status 'pago' não reaplica).
      if (ev.id) {
        await db.doc(`payments_events/${ev.id}`).set({
          tipo, checkoutId: id || null, resultado, devMode: !!ev.devMode,
          recebidoEm: FieldValue.serverTimestamp(),
        }, { merge: true }).catch(() => {})
      }
      return res.status(200).send(resultado)
    } catch (e) {
      // 500 faz a AbacatePay tentar de novo mais tarde.
      console.error('abacatepayWebhook:', e)
      return res.status(500).send('erro')
    }
  }
)

/**
 * redeemCoupon: cupom de 100% ativa o plano direto, sem checkout.
 * Cupons em config/coupons (ex.: { BEMVINDO: { discount: 100, active: true, dias: 30 } }).
 * Sem "dias", o plano do cupom não vence. Desconto parcial volta para o
 * app, que manda o cupom junto no createPlanCheckout.
 */
exports.redeemCoupon = onCall(
  { region: 'southamerica-east1', maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.')
    const uid = request.auth.uid
    const db = getFirestore()
    const catalogo = (await db.doc('config/plans').get()).data()?.plans
    const plano = pg.planoDoCatalogo(catalogo, String(request.data?.planId || ''))
    if (!plano) throw new HttpsError('not-found', 'Plano não encontrado.')
    const c = await cupomValido(db, request.data?.code)
    if (!c) throw new HttpsError('not-found', 'Cupom inválido ou expirado.')

    if (c.discount < 100) return { activated: false, discount: c.discount }

    const uref = db.doc(`users/${uid}`)
    const u = (await uref.get()).data() || {}
    await uref.set({
      plan: plano.id,
      featured: pg.PLANOS_DESTAQUE.includes(plano.id),
      planActivatedAt: FieldValue.serverTimestamp(),
      planCoupon: c.code,
      planExpiresAt: c.dias ? new Date(Date.now() + c.dias * 864e5) : null,
    }, { merge: true })
    await db.collection('payments').add({
      uid, planId: plano.id, centavos: 0, cupom: c.code, status: 'cupom',
      createdAt: FieldValue.serverTimestamp(),
    }).catch(() => {})
    if (u.referredByUid) {
      await db.doc(`users/${u.referredByUid}/referrals/${uid}`).set({
        activatedPlan: plano.id, activatedAt: FieldValue.serverTimestamp(), viaCupom: c.code,
      }, { merge: true }).catch(() => {})
    }
    return { activated: true, discount: 100 }
  }
)


/* ════════════════════════════════════════════════════════════════
   AUTO-CONFIRM após 24h
   Roda a cada hora. Solicitações em status 'finalizado' onde o
   veterinário confirmou mas o cliente não respondeu em 24h são
   confirmadas automaticamente.
   ════════════════════════════════════════════════════════════════ */
const { onSchedule } = require('firebase-functions/v2/scheduler')

exports.autoConfirmRequests = onSchedule(
  { schedule: 'every 1 hours', region: 'southamerica-east1', timeZone: 'America/Sao_Paulo' },
  async () => {
    const db = getFirestore()
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const snap = await db.collection('requests')
      .where('status', '==', 'finalizado')
      .where('confirmFinish_professional', '==', true)
      .where('confirmFinish_client', '==', false)
      .where('finalizedAt', '<=', cutoff)
      .get()

    if (snap.empty) return

    const batch = db.batch()
    snap.forEach(d => {
      batch.update(d.ref, {
        confirmFinish_client: true,
        autoConfirmedAt: FieldValue.serverTimestamp(),
      })
    })
    await batch.commit()
    console.log(`Auto-confirmed ${snap.size} request(s).`)
  }
)

/* ════════════════════════════════════════════════════════════════
   EXCLUSÃO DE CHATS EXPIRADOS (7 dias sem atividade)
   Roda 1x por dia. Apaga o chat e todas as mensagens (recursivo)
   onde expiresAt já passou.
   ════════════════════════════════════════════════════════════════ */
exports.deleteExpiredChats = onSchedule(
  { schedule: 'every 24 hours', region: 'southamerica-east1', timeZone: 'America/Sao_Paulo' },
  async () => {
    const db = getFirestore()
    const snap = await db.collection('chats')
      .where('expiresAt', '<=', new Date())
      .limit(300)
      .get()

    if (snap.empty) return

    let n = 0
    for (const d of snap.docs) {
      await db.recursiveDelete(d.ref).catch((e) => console.error('delete chat', d.id, e))
      n++
    }
    console.log(`Deleted ${n} expired chat(s).`)
  }
)

/* ════════════════════════════════════════════════════════════════
   CONSULTA DE CPF (apicpf.com)
   Preenche nome e nascimento no cadastro a partir do CPF.

   A chave fica no Secret Manager (APICPF_KEY), nunca no app: com ela
   no navegador, qualquer um consultaria nome e nascimento de qualquer
   CPF na conta da AVANTE.
   - Exige login.
   - CPF que já tem conta responde { jaCadastrado } SEM gastar consulta.
   - Teto por conta e teto diário geral, abaixo das 100/dia do plano.
   - Devolve só nome e nascimento. Gênero não é usado e não sai daqui.
   - O hash precisa bater com src/utils/cpf.js (SHA-256 dos 11 dígitos).

   Publicar SÓ esta função (as outras deste arquivo mudariam o app):
     firebase functions:secrets:set APICPF_KEY
     firebase deploy --only functions:consultarCpf
   ════════════════════════════════════════════════════════════════ */
const { cpfValido, hashCpf } = require('./cpf')
const APICPF_KEY = defineSecret('APICPF_KEY')
const CPF_POR_CONTA_DIA = 3
const CPF_TOTAL_DIA = 90
// Só o emulador local define APICPF_URL (aponta para uma API falsa). Em
// produção a variável não existe e vale o endereço real.
const APICPF_URL = process.env.APICPF_URL || 'https://apicpf.com/api/consulta'

async function cotaCpf(db, uid) {
  const hoje = new Date().toISOString().slice(0, 10)
  const conta = db.doc(`cpfUsage/${uid}`)
  const total = db.doc('cpfUsage/_total')
  await db.runTransaction(async (tx) => {
    const [c, t] = await Promise.all([tx.get(conta), tx.get(total)])
    const nConta = c.exists && c.data().dia === hoje ? Number(c.data().n || 0) : 0
    const nTotal = t.exists && t.data().dia === hoje ? Number(t.data().n || 0) : 0
    if (nConta >= CPF_POR_CONTA_DIA || nTotal >= CPF_TOTAL_DIA) {
      throw new HttpsError('resource-exhausted', 'Consulta indisponível agora. Preencha os dados à mão.')
    }
    tx.set(conta, { dia: hoje, n: nConta + 1 })
    tx.set(total, { dia: hoje, n: nTotal + 1 })
  })
}

exports.consultarCpf = onCall(
  { region: 'southamerica-east1', secrets: [APICPF_KEY], maxInstances: 3 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.')
    const cpf = String(request.data?.cpf || '').replace(/\D/g, '')
    if (!cpfValido(cpf)) throw new HttpsError('invalid-argument', 'CPF inválido.')

    const db = getFirestore()
    const hash = hashCpf(cpf)
    const reserva = await db.doc(`cpfs/${hash}`).get()
    if (reserva.exists && reserva.data().uid !== request.auth.uid) return { jaCadastrado: true }

    await cotaCpf(db, request.auth.uid)

    let r
    try {
      r = await fetch(`${APICPF_URL}?cpf=${cpf}`, {
        headers: { 'X-API-KEY': APICPF_KEY.value() },
        signal: AbortSignal.timeout(8000),
      })
    } catch (e) {
      console.error('apicpf indisponível:', e?.message)
      throw new HttpsError('unavailable', 'Consulta indisponível agora. Preencha os dados à mão.')
    }
    if (r.status === 404) return { encontrado: false }
    if (r.status === 429 || r.status === 402) {
      throw new HttpsError('resource-exhausted', 'Consulta indisponível agora. Preencha os dados à mão.')
    }
    if (!r.ok) {
      // 401/403 = chave errada ou vencida (o plano grátis vence todo mês).
      console.error('apicpf respondeu', r.status)
      throw new HttpsError('unavailable', 'Consulta indisponível agora. Preencha os dados à mão.')
    }
    const d = (await r.json())?.data || {}
    return {
      encontrado: true,
      nome: String(d.nome || '').slice(0, 120),
      nascimento: /^\d{4}-\d{2}-\d{2}$/.test(d.data_nascimento || '') ? d.data_nascimento : null,
    }
  }
)

/* ════════════════════════════════════════════════════════════════
   VENCIMENTO DOS PLANOS
   PIX não renova sozinho: quem pagou um mês tem 30 dias. Uma vez por
   dia, quem passou de planExpiresAt volta ao Free (e perde o Destaque).
   ════════════════════════════════════════════════════════════════ */
exports.expirarPlanos = onSchedule(
  { schedule: 'every day 03:00', region: 'southamerica-east1', timeZone: 'America/Sao_Paulo' },
  async () => {
    const db = getFirestore()
    const snap = await db.collection('users').where('planExpiresAt', '<=', new Date()).get()
    let n = 0
    for (const d of snap.docs) {
      if ((d.data().plan || 'free') === 'free') continue
      await d.ref.set({ plan: 'free', featured: false, planExpiredAt: FieldValue.serverTimestamp() }, { merge: true })
      n++
    }
    console.log(`${n} plano(s) vencido(s) voltaram ao Free.`)
  }
)
