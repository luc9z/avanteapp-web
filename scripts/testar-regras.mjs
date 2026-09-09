/**
 * Testa firestore.rules no emulador.
 *
 * Existe porque as regras são a única barreira real do app: o guard de
 * rota do React protege a tela, não o banco. Cada caso abaixo nasceu de
 * uma falha encontrada em revisão — o teste impede que ela volte.
 *
 * Como rodar:
 *   firebase emulators:exec --only firestore "node scripts/testar-regras.mjs"
 */
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'fs'
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
  query, where,
} from 'firebase/firestore'

const env = await initializeTestEnvironment({
  projectId: 'avante-regras-teste',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8099 },
})

const VET = 'vet_1'
const VET2 = 'vet_2'
const CLIENTE = 'cliente_1'
const CLIENTE2 = 'cliente_2'
const ADMIN = 'admin_1'
const BANIDO = 'vet_desativado'

const db = uid => env.authenticatedContext(uid).firestore()

/** Popula o banco ignorando as regras (só o seed usa esta porta). */
await env.withSecurityRulesDisabled(async ctx => {
  const d = ctx.firestore()
  await setDoc(doc(d, 'admins', ADMIN), { criadoEm: 'seed' })
  await setDoc(doc(d, 'users', VET), {
    uid: VET, name: 'Dra. Ana', profession: 'medico_veterinario',
    averageRating: 4.2, ratingCount: 10, disabled: false, plan: 'free',
  })
  await setDoc(doc(d, 'users', VET2), { uid: VET2, name: 'Dr. Bruno', profession: 'medico_veterinario' })
  await setDoc(doc(d, 'users', BANIDO), {
    uid: BANIDO, name: 'Conta Desativada', profession: 'medico_veterinario', disabled: true,
  })
  await setDoc(doc(d, 'users', CLIENTE), { uid: CLIENTE, name: 'Maria', email: 'maria@ex.com', profession: 'client' })
  await setDoc(doc(d, 'users', CLIENTE2), { uid: CLIENTE2, name: 'Joao', email: 'joao@ex.com', profession: 'client' })
  await setDoc(doc(d, 'users', VET, 'ratings', 'req_9'), { clientId: CLIENTE, rating: 1, comment: 'ruim' })
  await setDoc(doc(d, 'requests', 'emergencia_aberta'), {
    clientId: CLIENTE, status: 'urgente', clientName: 'Maria', clientContact: '34999998888',
    locationAddress: 'Rua X, 123', client_lat: -18.9, client_lng: -48.2,
  })
  await setDoc(doc(d, 'requests', 'com_orcamento'), {
    clientId: CLIENTE, professionalId: VET, status: 'orcamento',
    quote: { total: 500, items: [], approvedAt: null },
  })
})

let ok = 0, falhou = 0
async function teste(nome, fn) {
  try { await fn(); console.log(`  PASSOU  ${nome}`); ok++ }
  catch (e) { console.log(`  FALHOU  ${nome}\n          ${String(e.message).split('\n')[0]}`); falhou++ }
}

console.log('\n== Reputação: o veterinário não inflaciona a própria nota ==')
await teste('vet NÃO escreve averageRating no próprio doc', () =>
  assertFails(updateDoc(doc(db(VET), 'users', VET), { averageRating: 5, ratingCount: 999 })))
await teste('vet ainda edita o próprio perfil (nome)', () =>
  assertSucceeds(updateDoc(doc(db(VET), 'users', VET), { name: 'Dra. Ana Silva' })))
await teste('vet NÃO cria avaliação sobre si mesmo', () =>
  assertFails(setDoc(doc(db(VET), 'users', VET, 'ratings', 'fake'), { clientId: VET, rating: 5 })))
await teste('vet NÃO sobrescreve avaliação ruim que recebeu', () =>
  assertFails(setDoc(doc(db(VET), 'users', VET, 'ratings', 'req_9'), { clientId: VET, rating: 5 })))
await teste('cliente cria avaliação sobre o vet', () =>
  assertSucceeds(setDoc(doc(db(CLIENTE2), 'users', VET, 'ratings', 'req_10'), { clientId: CLIENTE2, rating: 5 })))
await teste('cliente NÃO edita avaliação de outro cliente', () =>
  assertFails(updateDoc(doc(db(CLIENTE2), 'users', VET, 'ratings', 'req_9'), { rating: 5 })))

console.log('\n== Conta desativada não se reativa sozinha ==')
await teste('conta desativada NÃO se reativa sozinha', () =>
  assertFails(updateDoc(doc(db(BANIDO), 'users', BANIDO), { disabled: false })))
await teste('usuário NÃO se desativa/reativa junto com outra edição', () =>
  assertFails(updateDoc(doc(db(BANIDO), 'users', BANIDO), { name: 'Novo Nome', disabled: false })))
await teste('admin desativa a conta', () =>
  assertSucceeds(updateDoc(doc(db(ADMIN), 'users', VET), { disabled: true })))

console.log('\n== Emergência: dados pessoais só para veterinário ==')
await teste('vet lê emergência aberta', () =>
  assertSucceeds(getDoc(doc(db(VET2), 'requests', 'emergencia_aberta'))))
await teste('OUTRO CLIENTE não lê emergência aberta (nome/telefone/GPS)', () =>
  assertFails(getDoc(doc(db(CLIENTE2), 'requests', 'emergencia_aberta'))))
await teste('cliente dono lê a própria emergência', () =>
  assertSucceeds(getDoc(doc(db(CLIENTE), 'requests', 'emergencia_aberta'))))

console.log('\n== Orçamento: o cliente aprova mas não reescreve o valor ==')
await teste('cliente aprova sem mexer no total', () =>
  assertSucceeds(updateDoc(doc(db(CLIENTE), 'requests', 'com_orcamento'), {
    status: 'a_caminho', 'quote.approvedAt': '2026-01-01T10:00:00Z',
  })))
await teste('cliente NÃO zera o total do orçamento', () =>
  assertFails(updateDoc(doc(db(CLIENTE), 'requests', 'com_orcamento'), {
    quote: { total: 0, items: [], approvedAt: null },
  })))
await teste('cliente NÃO troca o veterinário do atendimento', () =>
  assertFails(updateDoc(doc(db(CLIENTE), 'requests', 'com_orcamento'), { professionalId: VET2 })))

console.log('\n== Privacidade da base de usuários ==')
await teste('cliente NÃO lê o doc de outro cliente', () =>
  assertFails(getDoc(doc(db(CLIENTE2), 'users', CLIENTE))))
await teste('cliente lê o perfil público do veterinário', () =>
  assertSucceeds(getDoc(doc(db(CLIENTE2), 'users', VET))))
await teste('vet lê o doc do cliente que atende', () =>
  assertSucceeds(getDoc(doc(db(VET2), 'users', CLIENTE))))
await teste('busca de veterinários continua funcionando', () =>
  assertSucceeds(getDocs(query(collection(db(CLIENTE2), 'users'),
    where('profession', '==', 'medico_veterinario')))))

console.log('\n== Indicações e email_index ==')
await teste('indicado cria a própria indicação', () =>
  assertSucceeds(setDoc(doc(db(CLIENTE2), 'users', VET, 'referrals', CLIENTE2), { activatedPlan: null })))
await teste('terceiro NÃO injeta indicação em nome de outro', () =>
  assertFails(setDoc(doc(db(CLIENTE2), 'users', VET, 'referrals', 'outro_uid'), { activatedPlan: 'premium' })))
await teste('email_index não é mais gravável', () =>
  assertFails(setDoc(doc(db(CLIENTE2), 'email_index', 'maria@ex.com'), { uid: CLIENTE2 })))

console.log('\n== Admin ==')
await teste('admin lê a base inteira', () =>
  assertSucceeds(getDocs(collection(db(ADMIN), 'users'))))
await teste('admin apaga solicitação', () =>
  assertSucceeds(deleteDoc(doc(db(ADMIN), 'requests', 'emergencia_aberta'))))
await teste('não-admin NÃO apaga solicitação', () =>
  assertFails(deleteDoc(doc(db(CLIENTE2), 'requests', 'com_orcamento'))))

await env.cleanup()
console.log(`\n${ok} passaram, ${falhou} falharam`)
process.exit(falhou ? 1 : 0)
