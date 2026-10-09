/**
 * CPF: só lógica pura, sem Firebase (testada por npm run test:cpf).
 *
 * O banco nunca guarda o CPF como chave de documento. A trava de
 * "um CPF, uma conta" usa cpfs/{sha256 dos 11 dígitos}: a regra do
 * Firestore recusa criar o documento quando ele já existe, e isso é o que
 * impede o segundo cadastro. A Cloud Function consultarCpf calcula o
 * MESMO hash, então os dois lados precisam bater (o teste confere).
 */

/** Só os 11 dígitos. */
export function digitosCpf(raw) {
  return String(raw || '').replace(/\D/g, '').slice(0, 11)
}

/** SHA-256 hexadecimal dos 11 dígitos. Funciona no navegador e no Node 20+. */
export async function hashCpf(raw) {
  const dados = new TextEncoder().encode(digitosCpf(raw))
  const buf = await globalThis.crypto.subtle.digest('SHA-256', dados)
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const MINUSCULAS = new Set(['da', 'das', 'de', 'do', 'dos', 'e'])

/**
 * "LUCAS SILVEIRA DE MELO" -> "Lucas Silveira de Melo".
 * A base de CPF devolve o nome em maiúsculas; na tela isso parece grito.
 */
export function nomeProprio(nome) {
  return String(nome || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ')
}

/** "1985-07-15" -> "15/07/1985". Qualquer outra coisa vira null. */
export function dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}
