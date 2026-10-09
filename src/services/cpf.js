/**
 * Um CPF, uma conta.
 *
 * A reserva é um lote atômico: cria cpfs/{hash} com o uid da conta e grava
 * o mesmo hash em users/{uid}.cpfHash. As regras do Firestore:
 *  - recusam criar cpfs/{hash} que já existe (é a trava do 2º cadastro);
 *  - só deixam a conta reservar UM CPF (senão alguém reservava os CPFs de
 *    outras pessoas e as impedia de se cadastrar);
 *  - não deixam trocar o cpfHash depois. Troca só pelo admin.
 *
 * A consulta de nome e nascimento passa pela Cloud Function consultarCpf.
 * A chave da API nunca vem para o navegador: com ela no app publicado,
 * qualquer um consultaria nome e nascimento de qualquer CPF na conta da
 * AVANTE.
 */
import { doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
import { hashCpf, digitosCpf, nomeProprio } from '../utils/cpf'
import { isValidCPF } from '../utils/validators'

export class CpfJaCadastrado extends Error {
  constructor() { super('Este CPF já tem uma conta no AVANTE.') }
}
export class ContaJaTemCpf extends Error {
  constructor() { super('Esta conta já tem outro CPF. Para trocar, fale com o suporte.') }
}

/**
 * Reserva o CPF para a conta. Não faz nada se ele já é desta conta.
 * Lança CpfJaCadastrado (é de outra conta) ou ContaJaTemCpf.
 */
export async function reservarCpf(uid, cpf) {
  const hash = await hashCpf(cpf)
  const eu = (await getDoc(doc(db, 'users', uid))).data() || {}
  if (eu.cpfHash === hash) return
  if (eu.cpfHash) throw new ContaJaTemCpf()

  const lote = writeBatch(db)
  lote.set(doc(db, 'cpfs', hash), { uid, criadoEm: serverTimestamp() })
  lote.set(doc(db, 'users', uid), { cpfHash: hash }, { merge: true })
  try {
    await lote.commit()
  } catch (e) {
    // Os dados do lote são controlados aqui; a única recusa esperada é o
    // documento do CPF já existir, ou seja, ser de outra conta.
    if (e?.code === 'permission-denied') throw new CpfJaCadastrado()
    throw e
  }
}

const chamarConsulta = httpsCallable(functions, 'consultarCpf')
// Sem a função publicada (plano Spark), a primeira tentativa falha e as
// próximas da mesma sessão nem saem: o cadastro segue manual, sem erro.
let consultaIndisponivel = false
// Mesmo CPF não é consultado duas vezes na sessão. Cada conta tem 3
// consultas por dia: apagar e redigitar um dígito gastava o limite à toa.
const jaConsultados = new Map()

/**
 * Nome e nascimento do CPF, para preencher o cadastro.
 * Devolve { nome, nascimento } | { jaCadastrado: true } | null.
 * null = não deu para consultar; a pessoa preenche à mão.
 */
export async function consultarCpf(cpf) {
  if (consultaIndisponivel || !isValidCPF(cpf)) return null
  const chave = digitosCpf(cpf)
  if (jaConsultados.has(chave)) return jaConsultados.get(chave)
  try {
    const { data } = await chamarConsulta({ cpf: chave })
    let r = null
    if (data?.jaCadastrado) r = { jaCadastrado: true }
    else if (data?.encontrado && data.nome) r = { nome: nomeProprio(data.nome), nascimento: data.nascimento || null }
    jaConsultados.set(chave, r)
    return r
  } catch (e) {
    // Limite atingido é passageiro; função ausente ou fora do ar, não.
    if (e?.code !== 'functions/resource-exhausted') consultaIndisponivel = true
    if (import.meta.env.DEV) console.info('[cpf] consulta indisponível:', e?.code || e)
    return null
  }
}

/**
 * Contas criadas antes da trava têm CPF salvo e nenhuma reserva. Reserva
 * uma vez, no login. Se o CPF já estiver reservado por outra conta, só
 * registra no console: decidir qual das duas é a verdadeira é do admin.
 */
export async function garantirReservaDoCpf(uid) {
  try {
    const eu = (await getDoc(doc(db, 'users', uid))).data()
    if (!eu || eu.cpfHash) return
    const priv = await getDoc(doc(db, 'users', uid, 'private', 'profile')).catch(() => null)
    const cpf = priv?.data()?.cpf || eu.cpf
    if (!cpf || !isValidCPF(cpf)) return
    await reservarCpf(uid, cpf)
  } catch (e) {
    if (e instanceof CpfJaCadastrado) console.warn('[cpf] o CPF desta conta já está reservado por outra')
    else console.error('[cpf] reserva retroativa:', e)
  }
}
