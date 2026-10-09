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
  query, where, writeBatch,
} from 'firebase/firestore'

const env = await initializeTestEnvironment({
  projectId: 'avante-regras-teste',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8099 },
})

// Com o emulador do dia a dia já de pé, o banco do teste sobrevive entre
// rodadas, e um "criar" da rodada anterior vira "sobrescrever" na
// seguinte. Limpa só ESTE projeto ('avante-regras-teste'): os dados do
// app ficam em outro projectId e não são tocados.
await env.clearFirestore()

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
await teste('cliente recusa o orçamento (status próprio, valor intacto)', () =>
  assertSucceeds(updateDoc(doc(db(CLIENTE), 'requests', 'com_orcamento'), {
    status: 'orcamento_recusado', 'quote.rejectedAt': '2026-01-02T10:00:00Z',
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
await teste('indicação NÃO nasce já creditada', () =>
  assertFails(setDoc(doc(db(CLIENTE), 'users', VET, 'referrals', CLIENTE), { activatedPlan: 'premium' })))
await teste('ninguém indica a si mesmo', () =>
  assertFails(setDoc(doc(db(VET), 'users', VET, 'referrals', VET), { activatedPlan: null })))
await teste('indicado marca que ativou o plano', () =>
  assertSucceeds(updateDoc(doc(db(CLIENTE2), 'users', VET, 'referrals', CLIENTE2), {
    activatedPlan: 'premium', activatedAt: '2026-10-08T00:00:00Z', viaCupom: null,
  })))
await teste('indicado NÃO mexe em outros campos da indicação', () =>
  assertFails(updateDoc(doc(db(CLIENTE2), 'users', VET, 'referrals', CLIENTE2), { referredAt: 'ontem' })))
await teste('quem indicou lê as próprias indicações', () =>
  assertSucceeds(getDocs(collection(db(VET), 'users', VET, 'referrals'))))
await teste('outro vet NÃO lê as indicações alheias', () =>
  assertFails(getDocs(collection(db(VET2), 'users', VET, 'referrals'))))
await teste('email_index não é mais gravável', () =>
  assertFails(setDoc(doc(db(CLIENTE2), 'email_index', 'maria@ex.com'), { uid: CLIENTE2 })))

console.log('\n== Códigos de indicação ==')
await teste('vet reserva o próprio código', () =>
  assertSucceeds(setDoc(doc(db(VET), 'referralCodes', 'ANA1234'), { uid: VET })))
await teste('ninguém reserva código em nome de outro', () =>
  assertFails(setDoc(doc(db(VET2), 'referralCodes', 'BRUN1234'), { uid: VET })))
await teste('código já reservado NÃO é sobrescrito', () =>
  assertFails(setDoc(doc(db(VET2), 'referralCodes', 'ANA1234'), { uid: VET2 })))
await teste('código fora do formato é recusado', () =>
  assertFails(setDoc(doc(db(VET2), 'referralCodes', 'abc-1'), { uid: VET2 })))
await teste('conta recém-criada acha o indicador pelo código', () =>
  assertSucceeds(getDoc(doc(db('conta_nova'), 'referralCodes', 'ANA1234'))))
await teste('visitante sem conta NÃO lê código', () =>
  assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'referralCodes', 'ANA1234'))))
await teste('ninguém lista todos os códigos (daria a lista de quem indica)', () =>
  assertFails(getDocs(collection(db(CLIENTE), 'referralCodes'))))
await teste('admin lista os códigos', () =>
  assertSucceeds(getDocs(collection(db(ADMIN), 'referralCodes'))))
await teste('dono NÃO apaga o código (só o admin)', () =>
  assertFails(deleteDoc(doc(db(VET), 'referralCodes', 'ANA1234'))))

console.log('\n== Um CPF, uma conta ==')
// Hashes de mentira no formato certo (64 hex). O app usa SHA-256 do CPF.
const CPF_A = 'a'.repeat(64)
const CPF_B = 'b'.repeat(64)
/** O lote que o app faz: reserva + cpfHash no próprio perfil. */
function reservar(uid, hash, { gravaNoPerfil = true, dono = uid } = {}) {
  const d = db(uid)
  const lote = writeBatch(d)
  lote.set(doc(d, 'cpfs', hash), { uid: dono, criadoEm: 'agora' })
  if (gravaNoPerfil) lote.set(doc(d, 'users', uid), { cpfHash: hash }, { merge: true })
  return lote.commit()
}
await teste('vet reserva o próprio CPF', () => assertSucceeds(reservar(VET2, CPF_A)))
await teste('outra conta NÃO cadastra o mesmo CPF', () => assertFails(reservar(CLIENTE2, CPF_A)))
await teste('conta com CPF NÃO reserva um segundo', () => assertFails(reservar(VET2, CPF_B)))
await teste('reserva sem gravar no próprio perfil é recusada', () =>
  assertFails(reservar(CLIENTE2, CPF_B, { gravaNoPerfil: false })))
await teste('ninguém reserva CPF em nome de outra conta', () =>
  assertFails(reservar(CLIENTE2, CPF_B, { dono: VET })))
await teste('hash fora do formato é recusado', () => assertFails(reservar(CLIENTE2, '12345678900')))
await teste('dono NÃO troca o cpfHash depois', () =>
  assertFails(updateDoc(doc(db(VET2), 'users', VET2), { cpfHash: CPF_B })))
await teste('dono NÃO apaga o cpfHash para reservar outro', () =>
  assertFails(updateDoc(doc(db(VET2), 'users', VET2), { cpfHash: null })))
await teste('perfil com CPF continua editável (nome)', () =>
  assertSucceeds(updateDoc(doc(db(VET2), 'users', VET2), { name: 'Dr. Bruno Lima' })))
await teste('dono lê a própria reserva', () => assertSucceeds(getDoc(doc(db(VET2), 'cpfs', CPF_A))))
await teste('outra conta NÃO descobre de quem é o CPF', () =>
  assertFails(getDoc(doc(db(CLIENTE2), 'cpfs', CPF_A))))
await teste('ninguém lista os CPFs', () => assertFails(getDocs(collection(db(VET2), 'cpfs'))))
await teste('admin lista os CPFs', () => assertSucceeds(getDocs(collection(db(ADMIN), 'cpfs'))))
await teste('dono NÃO apaga a reserva (liberaria o CPF)', () =>
  assertFails(deleteDoc(doc(db(VET2), 'cpfs', CPF_A))))
await teste('segunda conta reserva um CPF livre normalmente', () => assertSucceeds(reservar(CLIENTE2, CPF_B)))

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
