/**
 * Testes de cobrança no Firebase Emulator (Firestore + Auth + Functions).
 *
 *   cd functions && npm install && cd ..
 *   npm run test:emulator
 *
 * Garante que o dono do perfil edita nome/foto/especialidades, mas não
 * consegue gravar plan/featured/etc. direto — só via Cloud Functions.
 */
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-avante'
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const FUNCTIONS_URL = `http://127.0.0.1:5001/${PROJECT_ID}/southamerica-east1`

let env

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  })
})

after(() => env?.cleanup())

beforeEach(() => env.clearFirestore())

/** Grava dados ignorando as regras (equivale ao Admin SDK). */
function seed(path, data) {
  return env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data))
}

// withSecurityRulesDisabled resolve com void, então o valor sai pela closure
async function readAsAdmin(path) {
  let data
  await env.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore(), path))).data()
  })
  return data
}

describe('firestore.rules — users/{uid}', () => {
  const vet = () => env.authenticatedContext('vet1').firestore()

  test('dono cria o próprio perfil sem campos de cobrança', async () => {
    await assertSucceeds(setDoc(doc(vet(), 'users/vet1'), {
      uid: 'vet1', name: 'Dra. Ana', profession: 'medico_veterinario', createdAt: serverTimestamp(),
    }))
  })

  test('dono NÃO cria perfil já com plan/featured', async () => {
    await assertFails(setDoc(doc(vet(), 'users/vet1'), { name: 'Dra. Ana', plan: 'premium' }))
    await assertFails(setDoc(doc(vet(), 'users/vet1'), { name: 'Dra. Ana', featured: true }))
  })

  test('dono edita nome, foto e especialidades', async () => {
    await seed('users/vet1', { name: 'Ana', plan: 'free', featured: false })
    await assertSucceeds(setDoc(doc(vet(), 'users/vet1'), {
      name: 'Dra. Ana Souza',
      photoURL: 'data:image/jpeg;base64,AAAA',
      specialties: ['clinica_geral', 'vacinacao'],
      updatedAt: serverTimestamp(),
    }, { merge: true }))
  })

  test('reenviar o mesmo valor de plan (sem alterar) é permitido', async () => {
    await seed('users/vet1', { name: 'Ana', plan: 'free' })
    await assertSucceeds(setDoc(doc(vet(), 'users/vet1'), { plan: 'free', name: 'Ana 2' }, { merge: true }))
  })

  test('dono NÃO grava plan: premium direto', async () => {
    await seed('users/vet1', { name: 'Ana', plan: 'free', featured: false })
    await assertFails(setDoc(doc(vet(), 'users/vet1'), { plan: 'premium' }, { merge: true }))
    await assertFails(updateDoc(doc(vet(), 'users/vet1'), { plan: 'premium' }))
  })

  test('dono NÃO grava plan quando o doc ainda não tinha plano', async () => {
    await seed('users/vet1', { name: 'Ana' })
    await assertFails(setDoc(doc(vet(), 'users/vet1'), { plan: 'premium' }, { merge: true }))
  })

  for (const [key, value] of [
    ['featured', true],
    ['planActivatedAt', Timestamp.now()],
    ['planCoupon', 'BEMVINDO'],
    ['planExpiresAt', Timestamp.now()],
    ['averageRating', 5],
    ['ratingCount', 999],
  ]) {
    test(`dono NÃO altera ${key}`, async () => {
      await seed('users/vet1', { name: 'Ana', plan: 'free', featured: false })
      await assertFails(updateDoc(doc(vet(), 'users/vet1'), { [key]: value }))
    })
  }

  test('dono NÃO remove o próprio plano', async () => {
    await seed('users/vet1', { name: 'Ana', plan: 'premium', featured: true })
    await assertFails(setDoc(doc(vet(), 'users/vet1'), { name: 'Ana' }))
  })

  test('outro usuário não escreve no perfil', async () => {
    await seed('users/vet1', { name: 'Ana' })
    const other = env.authenticatedContext('intruso').firestore()
    await assertFails(updateDoc(doc(other, 'users/vet1'), { name: 'hack' }))
  })
})

describe('firestore.rules — professionals/{id} (legado)', () => {
  const vet = () => env.authenticatedContext('vet1').firestore()

  test('dono edita dados comuns', async () => {
    await seed('professionals/vet1', { name: 'Ana', profession: 'medico_veterinario' })
    await assertSucceeds(updateDoc(doc(vet(), 'professionals/vet1'), { name: 'Dra. Ana' }))
  })

  test('dono NÃO grava plan/featured', async () => {
    await seed('professionals/vet1', { name: 'Ana' })
    await assertFails(updateDoc(doc(vet(), 'professionals/vet1'), { plan: 'premium' }))
    await assertFails(updateDoc(doc(vet(), 'professionals/vet1'), { featured: true }))
    await assertFails(setDoc(doc(env.authenticatedContext('vet2').firestore(), 'professionals/vet2'), { plan: 'premium' }))
  })
})

describe('firestore.rules — cupons', () => {
  test('usuário comum não lê cupons nem config/coupons', async () => {
    await seed('coupons/BEMVINDO', { discount: 100, active: true })
    await seed('config/coupons', { BEMVINDO: { discount: 100 } })
    await seed('config/plans', { plans: [] })
    const db = env.authenticatedContext('vet1').firestore()
    await assertFails(getDoc(doc(db, 'coupons/BEMVINDO')))
    await assertFails(getDoc(doc(db, 'config/coupons')))
    await assertFails(setDoc(doc(db, 'coupons/MEU100'), { discount: 100, active: true }))
    await assertSucceeds(getDoc(doc(db, 'config/plans')))
  })

  test('admin lê e cria cupons', async () => {
    await seed('admins/boss', { createdAt: Timestamp.now() })
    const db = env.authenticatedContext('boss').firestore()
    await assertSucceeds(setDoc(doc(db, 'coupons/NOVO100'), { discount: 100, active: true }))
    await assertSucceeds(getDoc(doc(db, 'coupons/NOVO100')))
  })
})

/* ── Cloud Functions (callable via HTTP no emulador) ───────────── */

async function signUp() {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }
  )
  const body = await res.json()
  assert.ok(body.idToken, `signUp falhou: ${JSON.stringify(body)}`)
  return { uid: body.localId, token: body.idToken }
}

/** Chama uma callable; devolve { result } ou { error: { status, message } }. */
async function call(name, data, token) {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  })
  return res.json()
}

describe('Cloud Functions — redeemCoupon / activateFreePlan', () => {
  beforeEach(() => seed('config/plans', {
    plans: [
      { id: 'free', name: 'Free', price: 0 },
      { id: 'essencial', name: 'Essencial', price: 29.9 },
      { id: 'premium', name: 'Premium', price: 59.9 },
    ],
  }))

  test('cupom válido ativa o plano no servidor (uma vez por usuário)', async () => {
    await seed('coupons/BEMVINDO', { discount: 100, active: true, redemptions: 0 })
    const { uid, token } = await signUp()
    await seed(`users/${uid}`, { name: 'Ana', plan: 'free' })

    const r = await call('redeemCoupon', { planId: 'premium', code: 'bemvindo' }, token)
    assert.deepEqual(r.result, { activated: true, discount: 100 })

    const u = await readAsAdmin(`users/${uid}`)
    assert.equal(u.plan, 'premium')
    assert.equal(u.featured, true)
    assert.equal(u.planCoupon, 'BEMVINDO')
    assert.ok(u.planActivatedAt)
    assert.equal(u.name, 'Ana')
    assert.equal((await readAsAdmin('coupons/BEMVINDO')).redemptions, 1)
    assert.ok(await readAsAdmin(`coupons/BEMVINDO/redemptions/${uid}`))

    const again = await call('redeemCoupon', { planId: 'essencial', code: 'BEMVINDO' }, token)
    assert.equal(again.error?.status, 'ALREADY_EXISTS')
    assert.equal((await readAsAdmin(`users/${uid}`)).plan, 'premium')
  })

  test('sem doc em coupons/, BEMVINDO não funciona mais (sem fallback hardcoded)', async () => {
    const { uid, token } = await signUp()
    const r = await call('redeemCoupon', { planId: 'premium', code: 'BEMVINDO' }, token)
    assert.equal(r.error?.status, 'NOT_FOUND')
    assert.equal((await readAsAdmin(`users/${uid}`))?.plan, undefined)
  })

  test('cupom inativo, expirado, esgotado ou fora do plano é recusado', async () => {
    await seed('coupons/OFF', { discount: 100, active: false })
    await seed('coupons/VELHO', { discount: 100, active: true, expiresAt: Timestamp.fromMillis(Date.now() - 1000) })
    await seed('coupons/ESGOTADO', { discount: 100, active: true, maxRedemptions: 1, redemptions: 1 })
    await seed('coupons/SOESSENCIAL', { discount: 100, active: true, plans: ['essencial'] })
    const { token } = await signUp()
    for (const code of ['OFF', 'VELHO', 'ESGOTADO', 'NAOEXISTE', '../config/plans']) {
      const r = await call('redeemCoupon', { planId: 'premium', code }, token)
      assert.equal(r.error?.status, 'NOT_FOUND', code)
    }
    const r = await call('redeemCoupon', { planId: 'premium', code: 'SOESSENCIAL' }, token)
    assert.equal(r.error?.status, 'FAILED_PRECONDITION')
  })

  test('plano inexistente ou sem login é recusado', async () => {
    await seed('coupons/BEMVINDO', { discount: 100, active: true })
    const { token } = await signUp()
    assert.equal((await call('redeemCoupon', { planId: 'pro', code: 'BEMVINDO' }, token)).error?.status, 'NOT_FOUND')
    assert.equal((await call('redeemCoupon', { planId: 'premium', code: 'BEMVINDO' })).error?.status, 'UNAUTHENTICATED')
  })

  test('activateFreePlan só ativa plano de preço 0', async () => {
    const { uid, token } = await signUp()
    assert.equal((await call('activateFreePlan', { planId: 'premium' }, token)).error?.status, 'PERMISSION_DENIED')
    assert.deepEqual((await call('activateFreePlan', { planId: 'free' }, token)).result, { activated: true })
    const u = await readAsAdmin(`users/${uid}`)
    assert.equal(u.plan, 'free')
    assert.equal(u.featured, false)
  })
})
