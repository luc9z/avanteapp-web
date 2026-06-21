/**
 * Cloud Functions do Avante.
 *
 * aiAssistant — proxy seguro para o Groq (Llama 3.3).
 *   - A chave da API fica no Secret Manager (GROQ_API_KEY), nunca no cliente.
 *   - Exige usuário autenticado.
 *   - Valida e limita o payload (anti-abuso de custo).
 *
 * Deploy:
 *   cd functions && npm install
 *   firebase functions:secrets:set GROQ_API_KEY
 *   firebase deploy --only functions
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')

const GROQ_API_KEY = defineSecret('GROQ_API_KEY')

const SYSTEM_PROMPT = `Você é a assistente virtual do Avante, aplicativo de veterinária a domicílio no Brasil.
Ajude clientes com dúvidas sobre saúde e bem-estar dos pets. Seja concisa e amigável em português brasileiro.
Quando o usuário descrever sintomas preocupantes ou precisar de atendimento veterinário,
inclua exatamente [SUGGEST_BOOKING] no final da sua resposta.
Nunca diagnostique definitivamente — sempre oriente a consultar um veterinário.`

const MAX_MESSAGES = 12
const MAX_CHARS_PER_MESSAGE = 1000

exports.aiAssistant = onCall(
  {
    region: 'southamerica-east1',
    secrets: [GROQ_API_KEY],
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login necessário.')
    }

    const messages = Array.isArray(request.data?.messages) ? request.data.messages : []
    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      throw new HttpsError('invalid-argument', 'Histórico de mensagens inválido.')
    }

    const chatMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m) => {
        const text = String(m?.content || '').slice(0, MAX_CHARS_PER_MESSAGE)
        if (!text) throw new HttpsError('invalid-argument', 'Mensagem vazia.')
        return { role: m.role === 'assistant' ? 'assistant' : 'user', content: text }
      }),
    ]

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY.value()}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 400,
        temperature: 0.7,
        messages: chatMessages,
      }),
    })

    if (!res.ok) {
      console.error('Groq error', res.status, await res.text().catch(() => ''))
      throw new HttpsError('unavailable', 'Assistente indisponível no momento.')
    }

    const data = await res.json()
    const reply = data?.choices?.[0]?.message?.content
      || 'Não consegui responder agora. Tente novamente.'

    return { reply }
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
   PLANOS + ABACATEPAY
   - createPlanCheckout: cria a cobrança e devolve a URL de pagamento
   - abacatepayWebhook: confirma o pagamento e ativa o plano
   Secrets:
     firebase functions:secrets:set ABACATEPAY_API_KEY
     firebase functions:secrets:set ABACATEPAY_WEBHOOK_SECRET
   Webhook no painel AbacatePay:
     https://southamerica-east1-<PROJECT>.cloudfunctions.net/abacatepayWebhook?webhookSecret=<SECRET>
   ════════════════════════════════════════════════════════════════ */
const { onRequest } = require('firebase-functions/v2/https')

const ABACATEPAY_API_KEY = defineSecret('ABACATEPAY_API_KEY')
const ABACATEPAY_WEBHOOK_SECRET = defineSecret('ABACATEPAY_WEBHOOK_SECRET')

exports.createPlanCheckout = onCall(
  { region: 'southamerica-east1', secrets: [ABACATEPAY_API_KEY], maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.')
    const uid = request.auth.uid
    const planId = String(request.data?.planId || '')

    const db = getFirestore()
    const plansSnap = await db.doc('config/plans').get()
    const plans = plansSnap.exists ? (plansSnap.data().plans || []) : []
    const plan = plans.find((p) => p.id === planId)
    if (!plan) throw new HttpsError('not-found', 'Plano não encontrado.')
    if (!plan.price || plan.price <= 0) throw new HttpsError('invalid-argument', 'Este plano não exige pagamento.')

    // Período: anual = 12 meses pelo preço de 10 (validado no servidor,
    // nunca confiando em valores vindos do cliente)
    const period = request.data?.period === 'anual' ? 'anual' : 'mensal'
    const amount = period === 'anual' ? plan.price * 10 : plan.price

    const userSnap = await db.doc(`users/${uid}`).get()
    const u = userSnap.exists ? userSnap.data() : {}

    const appUrl = request.data?.origin || 'https://avantepro-a1438.web.app'

    const res = await fetch('https://api.abacatepay.com/v1/billing/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ABACATEPAY_API_KEY.value()}`,
      },
      body: JSON.stringify({
        frequency: 'ONE_TIME',
        methods: ['PIX'],
        products: [{
          externalId: `plan:${planId}:${uid}`,
          name: `Avante — Plano ${plan.name} (${period})`,
          quantity: 1,
          price: Math.round(amount * 100), // centavos
        }],
        returnUrl: `${appUrl}/plans`,
        completionUrl: `${appUrl}/plans?status=paid`,
        customer: {
          name: u.name || 'Profissional Avante',
          email: u.email || request.auth.token.email || '',
          cellphone: u.phone || '',
        },
      }),
    })

    if (!res.ok) {
      console.error('AbacatePay error', res.status, await res.text().catch(() => ''))
      throw new HttpsError('unavailable', 'Não foi possível iniciar o pagamento. Tente novamente.')
    }

    const data = await res.json()
    const url = data?.data?.url || data?.url
    if (!url) throw new HttpsError('internal', 'Resposta inesperada do provedor de pagamento.')

    // Registra a intenção de compra (auditoria)
    await db.collection('payments').add({
      uid, planId, period,
      billingId: data?.data?.id || null,
      amount,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    }).catch(() => {})

    return { url }
  }
)

exports.abacatepayWebhook = onRequest(
  { region: 'southamerica-east1', secrets: [ABACATEPAY_WEBHOOK_SECRET], maxInstances: 3 },
  async (req, res) => {
    try {
      // Validação do segredo (padrão AbacatePay: query param)
      if (req.query.webhookSecret !== ABACATEPAY_WEBHOOK_SECRET.value()) {
        return res.status(401).send('unauthorized')
      }

      const event = req.body
      const type = event?.event || event?.type || ''
      if (!type.includes('billing.paid')) return res.status(200).send('ignored')

      const products = event?.data?.billing?.products || event?.data?.products || []
      const tag = products.map((p) => p.externalId || '').find((x) => x.startsWith('plan:'))
      if (!tag) return res.status(200).send('no-plan-tag')

      const [, planId, uid] = tag.split(':')
      if (!planId || !uid) return res.status(200).send('bad-tag')

      const db = getFirestore()
      await db.doc(`users/${uid}`).set({
        plan: planId,
        featured: planId === 'destaque',
        planActivatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })

      // Atualiza o registro de pagamento correspondente
      const billingId = event?.data?.billing?.id
      if (billingId) {
        const q = await db.collection('payments')
          .where('billingId', '==', billingId).limit(1).get()
        if (!q.empty) {
          await q.docs[0].ref.set({ status: 'paid', paidAt: FieldValue.serverTimestamp() }, { merge: true })
        }
      }

      return res.status(200).send('ok')
    } catch (e) {
      console.error('abacatepayWebhook:', e)
      return res.status(500).send('error')
    }
  }
)


/**
 * redeemCoupon — aplica cupom de desconto na assinatura do plano.
 * Cupons em config/coupons (ex.: { BEMVINDO: { discount: 100, active: true } }).
 * BEMVINDO (100%) existe como padrão de lançamento mesmo sem o doc.
 * Desconto de 100% ativa o plano direto, sem passar pelo AbacatePay.
 */
exports.redeemCoupon = onCall(
  { region: 'southamerica-east1', maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login necessário.')
    const uid = request.auth.uid
    const planId = String(request.data?.planId || '')
    const code = String(request.data?.code || '').trim().toUpperCase()
    if (!planId || !code) throw new HttpsError('invalid-argument', 'Informe o plano e o cupom.')

    const db = getFirestore()
    const couponsSnap = await db.doc('config/coupons').get()
    const coupons = couponsSnap.exists ? couponsSnap.data() : {}
    const coupon = coupons[code] || (code === 'BEMVINDO' ? { discount: 100, active: true } : null)

    if (!coupon || coupon.active === false) {
      throw new HttpsError('not-found', 'Cupom inválido ou expirado.')
    }

    const discount = Number(coupon.discount) || 0
    if (discount >= 100) {
      await db.doc(`users/${uid}`).set({
        plan: planId,
        featured: planId === 'destaque',
        planActivatedAt: FieldValue.serverTimestamp(),
        planCoupon: code,
      }, { merge: true })
      await db.collection('payments').add({
        uid, planId, amount: 0, coupon: code, status: 'paid_coupon',
        createdAt: FieldValue.serverTimestamp(),
      }).catch(() => {})
      return { activated: true, discount: 100 }
    }

    // Desconto parcial: devolve o percentual para o checkout aplicar
    return { activated: false, discount }
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
