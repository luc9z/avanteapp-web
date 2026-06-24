/**
 * Seed script — cria usuários e solicitações de teste no Firebase.
 * Uso: node scripts/seed.js
 *
 * Não precisa de service account — usa Firebase Auth REST API + Firestore REST API
 * com as mesmas credenciais do app.
 */

const API_KEY  = 'AIzaSyDan_QxlM3cPtRiJIEr0IkFBAHNkR5Yblw'
const PROJECT  = 'avante-pro'
const DB_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const AUTH_URL = `https://identitytoolkit.googleapis.com/v1`

// ─── Helpers REST ────────────────────────────────────────────────

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await r.json()
  if (!r.ok) throw new Error(json.error?.message || JSON.stringify(json))
  return json
}

async function patch(url, body, token) {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = await r.json()
  if (!r.ok) throw new Error(json.error?.message || JSON.stringify(json))
  return json
}

// Converte valor JS para Firestore REST value
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'string')  return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number')  return Number.isInteger(v) ? { integerValue: v } : { doubleValue: v }
  if (Array.isArray(v))       return { arrayValue: { values: v.map(toValue) } }
  if (typeof v === 'object')  return { mapValue: { fields: toFields(v) } }
  return { stringValue: String(v) }
}

// Converte objeto JS plano para Firestore REST document fields
function toFields(obj) {
  const fields = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    fields[k] = toValue(v)
  }
  return fields
}

async function setDoc(collection, docId, data, token) {
  const url = `${DB_URL}/${collection}/${docId}`
  return patch(url, { fields: toFields(data) }, token)
}

// Criar ou reusar usuário Auth
async function getOrCreateUser(email, password, displayName) {
  try {
    const res = await post(`${AUTH_URL}/accounts:signUp?key=${API_KEY}`, {
      email, password, displayName, returnSecureToken: true,
    })
    console.log(`  ✔ criado: ${email}`)
    return { uid: res.localId, token: res.idToken }
  } catch (e) {
    if (e.message.includes('EMAIL_EXISTS')) {
      const res = await post(`${AUTH_URL}/accounts:signInWithPassword?key=${API_KEY}`, {
        email, password, returnSecureToken: true,
      })
      console.log(`  ↩ já existe, logado: ${email}`)
      return { uid: res.localId, token: res.idToken }
    }
    throw e
  }
}

// ─── Dados de teste ──────────────────────────────────────────────

const VETS = [
  {
    email: 'vet.ana@avante-teste.com',
    password: 'Teste@123',
    name: 'Dra. Ana Rodrigues',
    firstName: 'Ana',
    lastName: 'Rodrigues',
    phone: '11991112233',
    crmv: 'SP-12345',
    specialties: ['Pequenos animais', 'Dermatologia'],
    bio: 'Médica veterinária com 8 anos de experiência em atendimento domiciliar.',
    baseLocation: { lat: -23.5505, lng: -46.6333 },
    serviceRadius: 30,
    isOnline: true,
    rating: 4.8,
    reviewCount: 47,
    profession: 'professional',
  },
  {
    email: 'vet.pedro@avante-teste.com',
    password: 'Teste@123',
    name: 'Dr. Pedro Silva',
    firstName: 'Pedro',
    lastName: 'Silva',
    phone: '11988990011',
    crmv: 'SP-67890',
    specialties: ['Equinos', 'Bovinos', 'Cirurgia'],
    bio: 'Especialista em grandes animais e cirurgia veterinária.',
    baseLocation: { lat: -23.5200, lng: -46.6100 },
    serviceRadius: 50,
    isOnline: false,
    rating: 4.6,
    reviewCount: 23,
    profession: 'professional',
  },
]

const CLIENTS = [
  {
    email: 'cliente.maria@avante-teste.com',
    password: 'Teste@123',
    name: 'Maria Oliveira',
    firstName: 'Maria',
    lastName: 'Oliveira',
    phone: '11977778888',
    profession: 'client',
  },
  {
    email: 'cliente.joao@avante-teste.com',
    password: 'Teste@123',
    name: 'João Santos',
    firstName: 'João',
    lastName: 'Santos',
    phone: '11966665555',
    profession: 'client',
  },
]

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 SEED — Avante teste\n')

  // 1. Criar usuários
  console.log('── Veterinários')
  const vets = []
  for (const v of VETS) {
    const { uid, token } = await getOrCreateUser(v.email, v.password, v.name)
    vets.push({ ...v, uid, token })
  }

  console.log('\n── Clientes')
  const clients = []
  for (const c of CLIENTS) {
    const { uid, token } = await getOrCreateUser(c.email, c.password, c.name)
    clients.push({ ...c, uid, token })
  }

  // 2. Criar perfis Firestore dos vets
  console.log('\n── Perfis veterinários')
  for (const v of vets) {
    await setDoc('users', v.uid, {
      uid: v.uid,
      name: v.name,
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email,
      phone: v.phone,
      crmv: v.crmv,
      specialties: v.specialties,
      bio: v.bio,
      baseLocation: v.baseLocation,
      serviceRadius: v.serviceRadius,
      isOnline: v.isOnline,
      rating: v.rating,
      reviewCount: v.reviewCount,
      profession: v.profession,
      planId: 'essencial',
      planActivatedAt: new Date().toISOString(),
    }, v.token)
    console.log(`  ✔ perfil: ${v.name}`)
  }

  // 3. Criar perfis Firestore dos clientes
  console.log('\n── Perfis clientes')
  for (const c of clients) {
    await setDoc('users', c.uid, {
      uid: c.uid,
      name: c.name,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      profession: c.profession,
    }, c.token)

    // subcoleção private/profile com telefone
    const privUrl = `${DB_URL}/users/${c.uid}/private/profile`
    await patch(privUrl, {
      fields: toFields({ phone: c.phone, updatedAt: new Date().toISOString() })
    }, c.token)
    console.log(`  ✔ perfil: ${c.name}`)
  }

  // 4. Criar solicitações
  console.log('\n── Solicitações')

  const requests = [
    {
      id: 'req-teste-001',
      clientId: clients[0].uid,
      clientName: clients[0].name,
      clientEmail: clients[0].email,
      clientContact: clients[0].phone,
      professionalId: vets[0].uid,
      professionalName: vets[0].name,
      service: 'Consulta domiciliar',
      animal: 'Gato - Whiskers',
      species: 'Gato',
      animalAge: '3 anos',
      date: '2026-06-25',
      time: '10:00',
      status: 'pendente',
      address: 'Rua das Flores, 123 - São Paulo/SP',
      location: { lat: -23.5600, lng: -46.6500 },
      price: 150,
      notes: 'Gato com tosse persistente há 3 dias.',
      statusHistory: [],
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: 'req-teste-002',
      clientId: clients[0].uid,
      clientName: clients[0].name,
      clientEmail: clients[0].email,
      clientContact: clients[0].phone,
      professionalId: vets[0].uid,
      professionalName: vets[0].name,
      service: 'Vacinação',
      animal: 'Cachorro - Rex',
      species: 'Cachorro',
      animalAge: '2 anos',
      date: '2026-06-24',
      time: '14:00',
      status: 'aceito',
      address: 'Av. Paulista, 1000 - São Paulo/SP',
      location: { lat: -23.5630, lng: -46.6543 },
      price: 120,
      notes: 'Vacina antirrábica e V10.',
      statusHistory: [
        { status: 'aceito', at: new Date(Date.now() - 1 * 3600000).toISOString() },
      ],
      createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    },
    {
      id: 'req-teste-003',
      clientId: clients[1].uid,
      clientName: clients[1].name,
      clientEmail: clients[1].email,
      clientContact: clients[1].phone,
      professionalId: vets[0].uid,
      professionalName: vets[0].name,
      service: 'Exame clínico',
      animal: 'Cachorro - Bolinha',
      species: 'Cachorro',
      animalAge: '5 anos',
      date: '2026-06-23',
      time: '09:00',
      status: 'em_andamento',
      address: 'Rua Augusta, 500 - São Paulo/SP',
      location: { lat: -23.5550, lng: -46.6600 },
      price: 200,
      notes: 'Animal letárgico e sem apetite.',
      statusHistory: [
        { status: 'aceito', at: new Date(Date.now() - 4 * 3600000).toISOString() },
        { status: 'em_andamento', at: new Date(Date.now() - 2 * 3600000).toISOString() },
      ],
      createdAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    },
    {
      id: 'req-teste-004',
      clientId: clients[1].uid,
      clientName: clients[1].name,
      clientEmail: clients[1].email,
      clientContact: clients[1].phone,
      professionalId: vets[1].uid,
      professionalName: vets[1].name,
      service: 'Curativo pós-cirúrgico',
      animal: 'Cavalo - Trovão',
      species: 'Equino',
      animalAge: '7 anos',
      date: '2026-06-22',
      time: '08:00',
      status: 'finalizado',
      address: 'Estrada da Granja, km 5 - SP',
      location: { lat: -23.4800, lng: -46.5900 },
      price: 350,
      notes: 'Pós-op de cólica. Animal se recuperando bem.',
      confirmFinish_client: true,
      rated: false,
      statusHistory: [
        { status: 'aceito', at: new Date(Date.now() - 26 * 3600000).toISOString() },
        { status: 'em_andamento', at: new Date(Date.now() - 25 * 3600000).toISOString() },
        { status: 'finalizado', at: new Date(Date.now() - 24 * 3600000).toISOString() },
      ],
      createdAt: new Date(Date.now() - 30 * 3600000).toISOString(),
    },
    {
      id: 'req-teste-005',
      clientId: clients[0].uid,
      clientName: clients[0].name,
      clientEmail: clients[0].email,
      clientContact: clients[0].phone,
      professionalId: vets[1].uid,
      professionalName: vets[1].name,
      service: 'Consulta domiciliar',
      animal: 'Gato - Luna',
      species: 'Gato',
      animalAge: '1 ano',
      date: '2026-06-21',
      time: '16:00',
      status: 'finalizado',
      address: 'Rua das Flores, 123 - São Paulo/SP',
      location: { lat: -23.5600, lng: -46.6500 },
      price: 150,
      notes: 'Primeiro atendimento veterinário da Luna.',
      confirmFinish_client: true,
      rated: true,
      rating: 5,
      ratingComment: 'Excelente profissional! Muito atencioso.',
      statusHistory: [
        { status: 'aceito', at: new Date(Date.now() - 50 * 3600000).toISOString() },
        { status: 'em_andamento', at: new Date(Date.now() - 49 * 3600000).toISOString() },
        { status: 'finalizado', at: new Date(Date.now() - 48 * 3600000).toISOString() },
      ],
      createdAt: new Date(Date.now() - 54 * 3600000).toISOString(),
    },
  ]

  for (const req of requests) {
    const { id, ...data } = req
    // A solicitação é criada como o cliente (para respeitar as regras do Firestore)
    const clientUser = clients.find(c => c.uid === req.clientId)
    await setDoc('requests', id, data, clientUser.token)
    console.log(`  ✔ ${id} [${data.status}] — ${data.clientName} → ${data.professionalName}`)
  }

  // 5. Criar chats básicos para cada request
  console.log('\n── Chats')
  for (const req of requests) {
    const chatId = `${req.clientId}_${req.professionalId}`
    const clientUser = clients.find(c => c.uid === req.clientId)
    const vet = vets.find(v => v.uid === req.professionalId)
    await setDoc('chats', chatId, {
      participants: [req.clientId, req.professionalId],
      participantNames: { [req.clientId]: req.clientName, [req.professionalId]: req.professionalName },
      lastMessage: 'Olá, aguardo confirmação.',
      lastMessageAt: new Date(Date.now() - 1 * 3600000).toISOString(),
      requestId: req.id,
    }, clientUser.token)

    // Mensagem inicial
    const msgUrl = `${DB_URL}/chats/${chatId}/messages`
    await fetch(msgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientUser.token}` },
      body: JSON.stringify({
        fields: toFields({
          senderId: req.clientId,
          senderName: req.clientName,
          text: 'Olá! Aguardo a confirmação do atendimento.',
          createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
          read: false,
        })
      })
    })

    if (req.status !== 'pendente') {
      await fetch(msgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vet.token}` },
        body: JSON.stringify({
          fields: toFields({
            senderId: req.professionalId,
            senderName: req.professionalName,
            text: 'Olá! Confirmado, estarei aí no horário combinado.',
            createdAt: new Date(Date.now() - 1 * 3600000).toISOString(),
            read: false,
          })
        })
      })
    }

    console.log(`  ✔ chat: ${chatId.substring(0, 16)}...`)
  }

  console.log('\n✅ Seed concluído!\n')
  console.log('Contas de teste:')
  console.log('  VETs:')
  for (const v of VETS) console.log(`    ${v.email} / ${v.password}`)
  console.log('  Clientes:')
  for (const c of CLIENTS) console.log(`    ${c.email} / ${c.password}`)
  console.log('')
}

main().catch(e => { console.error('\n❌ Erro:', e.message); process.exit(1) })
