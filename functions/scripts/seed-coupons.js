/**
 * Cria/atualiza cupons em coupons/{CODIGO} (legível só por admin).
 *
 *   # produção (credencial de service account com acesso ao Firestore)
 *   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/seed-coupons.js --project avante-pro NOVOCODIGO --max 100
 *   # emulador
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seed-coupons.js --project demo-avante BEMVINDO
 *
 * Opções: --discount 100 (padrão) · --max N (limite total de resgates)
 *         --plans premium,essencial · --expires 2026-12-31 · --disable
 */
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args.splice(i, 2)[1] : undefined
}
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args.splice(i, 1), true) : false
}

const projectId = opt('project')
const discount = Number(opt('discount') ?? 100)
const max = opt('max')
const plans = opt('plans')
const expires = opt('expires')
const disable = flag('disable')
const codes = args.map((c) => c.trim().toUpperCase()).filter(Boolean)

if (!projectId || codes.length === 0) {
  console.error('Uso: node scripts/seed-coupons.js --project <id> CODIGO [CODIGO...] [opções]')
  process.exit(1)
}

initializeApp({ projectId })
const db = getFirestore()

Promise.all(codes.map((code) => db.doc(`coupons/${code}`).set({
  discount,
  active: !disable,
  ...(max ? { maxRedemptions: Number(max) } : {}),
  ...(plans ? { plans: plans.split(',').map((p) => p.trim()) } : {}),
  ...(expires ? { expiresAt: Timestamp.fromDate(new Date(expires)) } : {}),
}, { merge: true }))).then(() => {
  console.log(`OK: ${codes.join(', ')} → coupons/ (${discount}% ${disable ? 'inativo' : 'ativo'})`)
})
