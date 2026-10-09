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
        featured: ['premium','destaque'].includes(planId),
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
        featured: ['premium','destaque'].includes(planId),
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
