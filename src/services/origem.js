/**
 * Guarda a origem da visita e grava na conta quando ela nasce.
 * A lógica de junção mora em utils/origem.js; aqui é só navegador e banco.
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { CHAVE_ORIGEM, lerMarcacoes, juntarOrigem, origemParaGravar } from '../utils/origem'

export function lerOrigemGuardada() {
  try { return JSON.parse(localStorage.getItem(CHAVE_ORIGEM) || 'null') } catch { return null }
}

function guardar(o) {
  try { localStorage.setItem(CHAVE_ORIGEM, JSON.stringify(o)) } catch { /* storage indisponível */ }
}

/** Roda uma vez, na carga do app. Visita sem marcação não grava nada. */
export function capturarOrigem(loc = window.location) {
  const nova = lerMarcacoes(loc.search)
  if (!nova) return
  guardar(juntarOrigem(lerOrigemGuardada(), nova, loc.pathname))
}

/** Qual botão da página de apresentação a pessoa apertou. */
export function marcarIntencao(intencao) {
  guardar({ ...(lerOrigemGuardada() || { pagina: '/conheca', em: new Date().toISOString() }), intencao })
}

/** Código de indicação que vale agora, venha da URL ou da visita guardada. */
export function codigoDeIndicacao() {
  return lerOrigemGuardada()?.ref || null
}

/**
 * Grava a origem na conta recém-criada e registra a indicação.
 *
 * Chamada só nos dois pontos onde uma conta nasce: cadastro por e-mail
 * e primeiro login pelo Google. Nunca bloqueia o cadastro: falha vira
 * console.error, e a pessoa entra no app normalmente.
 */
export async function registrarOrigem(uid) {
  const guardada = lerOrigemGuardada()
  const dados = { origem: origemParaGravar(guardada) }

  if (guardada?.ref) {
    try {
      // Busca direta pelo código. A consulta antiga em users, filtrando
      // por referralCode, era recusada pelas regras para quem acabou de
      // criar a conta, e a indicação nunca era registrada.
      const snap = await getDoc(doc(db, 'referralCodes', guardada.ref))
      const indicador = snap.exists() ? snap.data().uid : null
      if (!indicador) {
        console.warn('[indicação] código não existe:', guardada.ref)
      } else if (indicador === uid) {
        console.warn('[indicação] a pessoa usou o próprio código')
      } else {
        await setDoc(doc(db, 'users', indicador, 'referrals', uid), {
          referredAt: serverTimestamp(),
          activatedPlan: null,
        })
        dados.referredBy = guardada.ref
        dados.referredByUid = indicador
      }
    } catch (e) {
      console.error('[indicação] falha ao registrar:', e)
    }
  }

  try {
    await setDoc(doc(db, 'users', uid), dados, { merge: true })
    // Gravou: a próxima conta criada neste navegador não herda a origem.
    try { localStorage.removeItem(CHAVE_ORIGEM) } catch { /* storage indisponível */ }
  } catch (e) {
    console.error('[origem] falha ao gravar:', e)
  }
}

/**
 * Avisa quem indicou que o colega ativou um plano.
 *
 * Só o indicado escreve aqui (ele é o dono da entrada). Ativação por
 * cupom também gera mês grátis, mas fica marcada em viaCupom: é o que
 * permite ao admin ver quais meses vieram de cupom antes de concedê-los.
 */
export async function avisarAtivacaoDePlano(uid, plano, cupom = null) {
  try {
    const eu = await getDoc(doc(db, 'users', uid))
    const indicador = eu.data()?.referredByUid
    if (!indicador) return
    await setDoc(doc(db, 'users', indicador, 'referrals', uid), {
      activatedPlan: plano,
      activatedAt: serverTimestamp(),
      viaCupom: cupom || null,
    }, { merge: true })
  } catch (e) {
    console.error('[indicação] falha ao avisar ativação:', e)
  }
}
