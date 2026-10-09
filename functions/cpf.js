/**
 * Validação e hash de CPF do lado do servidor.
 * Separado do index.js para o teste (npm run test:cpf) carregar sem
 * inicializar o Firebase. O hash TEM que bater com src/utils/cpf.js.
 */
const { createHash } = require('crypto')

function cpfValido(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

function hashCpf(cpf) {
  return createHash('sha256').update(cpf).digest('hex')
}

module.exports = { cpfValido, hashCpf }
