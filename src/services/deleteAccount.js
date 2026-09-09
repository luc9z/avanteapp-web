/**
 * deleteAccount - exclusão em cascata de uma conta (uso do admin).
 *
 * O Firestore não apaga em cascata: subcoleção não some junto com o
 * documento-pai, e nada some junto com o dono. Então tudo é varrido
 * explicitamente aqui.
 *
 * O fluxo é sempre: `contarVinculos()` primeiro, para o admin ver o que
 * será apagado, e só então `excluirConta()`. Não há como desfazer.
 *
 * O login (Firebase Authentication) NÃO é removido - isso exige o Admin
 * SDK, que precisa do plano Blaze. A conta some do app, mas o e-mail
 * continua registrado e precisa ser apagado no console.
 */
import {
  collection, query, where, getDocs, doc, deleteDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'

/** Apaga uma lista de refs em lotes (limite do Firestore é 500). */
async function apagarEmLotes(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db)
    refs.slice(i, i + 400).forEach(r => batch.delete(r))
    await batch.commit()
  }
}

/** Documentos de uma consulta, como refs. */
async function refsDe(q) {
  const snap = await getDocs(q)
  return snap.docs.map(d => d.ref)
}

/**
 * Levanta tudo que está vinculado ao usuário, sem apagar nada.
 * @returns {Promise<{solicitacoes:number, agendamentos:number, conversas:number,
 *                    animais:number, prontuarios:number, avaliacoes:number}>}
 */
export async function contarVinculos(uid) {
  const [comoCliente, comoVet, apptCliente, apptVet, conversas, animais, avaliacoes] = await Promise.all([
    refsDe(query(collection(db, 'requests'), where('clientId', '==', uid))),
    refsDe(query(collection(db, 'requests'), where('professionalId', '==', uid))),
    refsDe(query(collection(db, 'appointments'), where('clientId', '==', uid))),
    refsDe(query(collection(db, 'appointments'), where('professionalId', '==', uid))),
    refsDe(query(collection(db, 'chats'), where('participants', 'array-contains', uid))),
    refsDe(collection(db, 'users', uid, 'pets')),
    refsDe(collection(db, 'users', uid, 'ratings')),
  ])

  // Um mesmo request pode aparecer nas duas consultas (raro, mas possível)
  const solicitacoes = new Set([...comoCliente, ...comoVet].map(r => r.path)).size
  const agendamentos = new Set([...apptCliente, ...apptVet].map(r => r.path)).size

  return {
    solicitacoes,
    agendamentos,
    conversas: conversas.length,
    animais: animais.length,
    prontuarios: animais.length,   // um prontuário por animal
    avaliacoes: avaliacoes.length,
  }
}

/**
 * Apaga a conta e tudo que depende dela. Irreversível.
 * @param {string} uid
 * @param {(etapa: string) => void} [onProgress] para mostrar andamento
 */
export async function excluirConta(uid, onProgress = () => {}) {
  // 1. Solicitações e agendamentos (nos dois papéis)
  onProgress('Solicitações e agendamentos')
  const [reqC, reqV, appC, appV] = await Promise.all([
    refsDe(query(collection(db, 'requests'), where('clientId', '==', uid))),
    refsDe(query(collection(db, 'requests'), where('professionalId', '==', uid))),
    refsDe(query(collection(db, 'appointments'), where('clientId', '==', uid))),
    refsDe(query(collection(db, 'appointments'), where('professionalId', '==', uid))),
  ])
  const unicos = refs => [...new Map(refs.map(r => [r.path, r])).values()]
  await apagarEmLotes(unicos([...reqC, ...reqV, ...appC, ...appV]))

  // 2. Conversas - as mensagens são subcoleção e precisam ir antes
  onProgress('Conversas')
  const chats = await getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', uid)))
  for (const c of chats.docs) {
    const msgs = await refsDe(collection(db, 'chats', c.id, 'messages'))
    await apagarEmLotes(msgs)
    await deleteDoc(c.ref).catch(() => {})
  }

  // 3. Animais, prontuários e registros clínicos
  onProgress('Animais e prontuários')
  const pets = await getDocs(collection(db, 'users', uid, 'pets'))
  for (const p of pets.docs) {
    const [records, entries, weights] = await Promise.all([
      refsDe(collection(db, 'users', uid, 'pets', p.id, 'records')),
      refsDe(collection(db, 'medicalRecords', p.id, 'entries')),
      refsDe(collection(db, 'medicalRecords', p.id, 'weightLog')),
    ])
    await apagarEmLotes([...records, ...entries, ...weights])
    await deleteDoc(doc(db, 'medicalRecords', p.id)).catch(() => {})
    await deleteDoc(p.ref).catch(() => {})
  }

  // 4. Subcoleções restantes do usuário
  onProgress('Dados do perfil')
  for (const sub of ['ratings', 'referrals', 'settings', 'private']) {
    const refs = await refsDe(collection(db, 'users', uid, sub)).catch(() => [])
    await apagarEmLotes(refs)
  }

  // 5. Por último o documento do usuário
  onProgress('Conta')
  await deleteDoc(doc(db, 'users', uid))
}
