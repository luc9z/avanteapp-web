/**
 * ratings.js - nota do veterinário calculada a partir das avaliações.
 *
 * Por que não usar `averageRating`/`ratingCount` do documento do vet:
 * esses campos seriam preenchidos por uma Cloud Function
 * (`onRatingCreated`), e o projeto está no plano Spark, onde função não
 * roda. Ou seja, o número exibido na busca nunca era recalculado - e,
 * como o dono podia escrever o próprio documento, dava para se dar 5,0
 * e subir no ranking. As regras agora bloqueiam esses dois campos, e a
 * média passa a sair de `users/{uid}/ratings`, que é a fonte real.
 *
 * O custo é uma leitura por veterinário exibido, então o resultado fica
 * em cache por sessão: a lista rola e volta sem repetir a consulta.
 */
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

/** uid → { avg, count }. Vive enquanto a aba estiver aberta. */
const cache = new Map()

/** Descarta o cache de um vet (após uma avaliação nova, por exemplo). */
export function invalidarNota(uid) {
  if (uid) cache.delete(uid)
  else cache.clear()
}

/** Lê e resume as avaliações de um veterinário. */
export async function carregarNota(uid) {
  if (!uid) return { avg: 0, count: 0 }
  if (cache.has(uid)) return cache.get(uid)

  let resumo = { avg: 0, count: 0 }
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'ratings'))
    const notas = snap.docs
      .map(d => Number(d.data()?.rating))
      .filter(n => Number.isFinite(n) && n > 0)
    if (notas.length) {
      resumo = {
        avg: notas.reduce((s, n) => s + n, 0) / notas.length,
        count: notas.length,
      }
    }
  } catch (e) {
    // Sem permissão ou sem rede: o cartão mostra "sem avaliações", que é
    // melhor do que exibir uma nota inventada. Não cacheia a falha.
    if (import.meta.env.DEV) console.error('[ratings] falha ao ler', uid, e)
    return resumo
  }

  cache.set(uid, resumo)
  return resumo
}

/**
 * Resolve a nota de vários veterinários de uma vez e devolve a mesma
 * lista com `averageRating` e `ratingCount` preenchidos - assim as telas
 * que já liam esses campos continuam funcionando sem alteração.
 */
export async function comNotas(vets) {
  if (!Array.isArray(vets) || vets.length === 0) return vets || []
  const resumos = await Promise.all(vets.map(v => carregarNota(v.uid || v.id)))
  return vets.map((v, i) => ({
    ...v,
    averageRating: resumos[i].avg,
    ratingCount: resumos[i].count,
  }))
}
