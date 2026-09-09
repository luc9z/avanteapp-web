/**
 * Popula os emuladores com um veterinário e um cliente de mentira.
 *
 * Existe para conferir LAYOUT: as telas logadas só mostram o problema
 * real quando têm conteúdo de verdade - lista cheia, nomes longos,
 * números grandes. Simulação em harness engana.
 *
 * Nunca toca em produção: fala só com 127.0.0.1 e depende dos
 * emuladores estarem de pé.
 *
 *   firebase emulators:start --only auth,firestore --project avante-local
 *   node scripts/semear-local.mjs
 */
import fs from 'fs'

/**
 * O projeto TEM que ser o mesmo do .env.local.
 *
 * O emulador guarda os dados por projectId e o app conecta com o id da
 * sua configuração. Semear num id diferente cria um banco paralelo que
 * o app nunca lê - e a tela abre vazia sem nenhum erro, que foi
 * exatamente o que aconteceu aqui.
 */
const PROJETO = (fs.readFileSync('.env.local', 'utf8')
  .match(/VITE_FIREBASE_PROJECT_ID\s*=\s*(.+)/) || [])[1]?.trim() || 'demo'

const AUTH = 'http://127.0.0.1:9099'
const FS = `http://127.0.0.1:8099/v1/projects/${PROJETO}/databases/(default)/documents`

const SENHA = 'teste123456'   // credencial descartável, só do emulador

async function criarConta(email) {
  const r = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=qualquer`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: SENHA, returnSecureToken: true }) })
  const d = await r.json()
  if (d.localId) return d.localId

  // Rodar de novo com os emuladores já de pé cai aqui: reaproveita a
  // conta em vez de falhar, para o script poder ser repetido à vontade.
  if (d.error?.message === 'EMAIL_EXISTS') {
    const l = await fetch(
      `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qualquer`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: SENHA, returnSecureToken: true }) })
    const j = await l.json()
    if (j.localId) return j.localId
  }
  throw new Error(`conta ${email}: ${JSON.stringify(d.error?.message)}`)
}

/* O REST do Firestore quer o tipo em cada campo. */
function valor(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valor(x)])) } }
}

async function gravar(caminho, dados) {
  const r = await fetch(`${FS}/${caminho}`, {
    method: 'PATCH',
    // 'Bearer owner' e o atalho do emulador para escrever ignorando as
    // regras. So existe no emulador; em producao seria recusado.
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, valor(v)])) }),
  })
  if (!r.ok) throw new Error(`gravar ${caminho}: ${r.status} ${await r.text()}`)
}

const agora = new Date()
const dias = n => new Date(agora.getTime() - n * 864e5)

const vetUid = await criarConta('vet@teste.local')
const cliUid = await criarConta('tutor@teste.local')

await gravar(`users/${vetUid}`, {
  uid: vetUid, name: 'Dra. Helena Vasconcelos Andrade', email: 'vet@teste.local',
  profession: 'medico_veterinario', council: 'CRMV-SP 12345', city: 'Uberlândia',
  phone: '(34) 99999-8888', is_online: true, plan: 'premium',
  specialties: ['Bovinos', 'Equinos', 'Cães e Gatos'],
  serviceRadius: 50, baseLocation: { lat: -18.91, lng: -48.27 },
  monthlyGoal: 8000, goalType: 'mensal', createdAt: dias(120),
})
await gravar(`users/${cliUid}`, {
  uid: cliUid, name: 'Jorge Melo', email: 'tutor@teste.local',
  profession: 'client', city: 'Uberlândia', createdAt: dias(90),
})

/* Animais do tutor */
const pets = [
  { id: 'pet1', name: 'Rex', species: 'Cão', breed: 'Labrador', weight: 32 },
  { id: 'pet2', name: 'Mimosa', species: 'Bovino', breed: 'Nelore', weight: 480 },
  { id: 'pet3', name: 'Relâmpago', species: 'Equino', breed: 'Mangalarga', weight: 420 },
  { id: 'pet4', name: 'Frida', species: 'Gato', breed: 'SRD', weight: 4 },
]
for (const p of pets) {
  await gravar(`users/${cliUid}/pets/${p.id}`, { ...p, createdAt: dias(60) })
}

/* Solicitações em todos os status, para a lista mostrar variedade */
const SERVICOS = ['Consulta clínica', 'Vacinação', 'Atendimento de emergência', 'Reprodução', 'Exame de imagem']
const STATUS = ['pendente', 'aceito', 'a_caminho', 'em_andamento', 'orcamento', 'finalizado', 'finalizado', 'rejeitado', 'urgente', 'pendente', 'finalizado', 'aceito']
for (let i = 0; i < STATUS.length; i++) {
  const pet = pets[i % pets.length]
  const st = STATUS[i]
  await gravar(`requests/req${i}`, {
    clientId: cliUid, professionalId: st === 'urgente' ? null : vetUid,
    clientName: 'Jorge Melo', professionalName: st === 'urgente' ? '' : 'Dra. Helena Vasconcelos Andrade',
    service: SERVICOS[i % SERVICOS.length], status: st,
    petName: pet.name, petSpecies: pet.species,
    location: i % 3 === 0 ? 'Fazenda Dois Irmãos, Zona Rural' : 'Rua das Acácias, 340',
    locationAddress: 'Uberlândia, MG',
    urgency: st === 'urgente' ? 'urgent' : 'normal',
    description: 'Animal apresentando apatia e queda de apetite desde ontem.',
    createdAt: dias(i * 3),
    ...(st === 'orcamento' || st === 'finalizado'
      ? { quote: { total: 180 + i * 45, items: [], sentAt: dias(i * 3).toISOString(),
                   approvedAt: st === 'finalizado' ? dias(i * 3).toISOString() : null } }
      : {}),
    ...(st === 'finalizado' ? { confirmFinish_client: true, rated: i % 2 === 0 } : {}),
  })
}

/* Avaliações, para a nota aparecer */
for (let i = 0; i < 7; i++) {
  await gravar(`users/${vetUid}/ratings/req${i}`, {
    clientId: cliUid, clientName: 'Jorge Melo',
    rating: [5, 4, 5, 5, 4, 3, 5][i], comment: 'Atendimento excelente, muito atenciosa.',
    createdAt: dias(i * 5),
  })
}

/* Disponibilidade do vet */
await gravar(`users/${vetUid}/settings/availability`, {
  enabled: true, slotDuration: 60,
  days: [
    { active: false, start: '08:00', end: '18:00' },
    { active: true, start: '08:00', end: '18:00' },
    { active: true, start: '08:00', end: '18:00' },
    { active: true, start: '08:00', end: '18:00' },
    { active: true, start: '08:00', end: '18:00' },
    { active: true, start: '08:00', end: '12:00' },
    { active: false, start: '08:00', end: '18:00' },
  ],
})

/* Ofertas, que aparecem no topo das listas */
await gravar('offers/of1', {
  emoji: '🦴', title: 'Ração premium com 15% OFF',
  subtitle: 'Para cães e gatos, entrega na sua região',
  cta: 'Aproveitar', url: 'https://exemplo.com', active: true, order: 1,
  size: 'small', audience: 'all', gradient: 'amber',
})

console.log('Semeado nos emuladores:')
console.log(`  vet   vet@teste.local    uid ${vetUid}`)
console.log(`  tutor tutor@teste.local  uid ${cliUid}`)
console.log(`  senha ${SENHA}`)
console.log(`  ${STATUS.length} solicitações, ${pets.length} animais, 7 avaliações`)
