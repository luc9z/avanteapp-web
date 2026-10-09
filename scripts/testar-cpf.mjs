/**
 * App e servidor precisam concordar sobre o CPF.
 *
 * O app reserva cpfs/{hash} e a Cloud Function procura o mesmo
 * cpfs/{hash} para responder "já cadastrado". Se os dois calcularem o
 * hash diferente, a função nunca acha a reserva, e cada um aceita um CPF
 * que o outro recusa. Nada disso aparece na tela: só este teste pega.
 *
 *   npm run test:cpf
 */
import { createRequire } from 'module'
import { digitosCpf, hashCpf, nomeProprio, dataBR } from '../src/utils/cpf.js'
import { isValidCPF, formatCPF } from '../src/utils/validators.js'

const require = createRequire(import.meta.url)
const servidor = require('../functions/cpf.js')

let erros = 0
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok    ' : 'FALHOU'} ${msg}`); if (!cond) erros++ }

/** Monta um CPF com dígitos verificadores certos (só matemática, nenhuma consulta). */
function comDigitos(base9) {
  const c = base9.split('').map(Number)
  for (const n of [9, 10]) {
    let s = 0
    for (let i = 0; i < n; i++) s += c[i] * (n + 1 - i)
    const r = (s * 10) % 11
    c.push(r === 10 ? 0 : r)
  }
  return c.join('')
}

const validos = ['123456789', '987654321', '111444777', '529982247', '000000191'].map(comDigitos)
const invalidos = [
  '11111111111', '00000000000', '12345678900', '1234567890', '123456789012', '', 'abc',
  validos[0].slice(0, 10) + String((Number(validos[0][10]) + 1) % 10),
]

console.log('=== app e servidor validam igual ===')
for (const c of [...validos, ...invalidos]) {
  const app = isValidCPF(c), srv = servidor.cpfValido(c)
  ok(app === srv, `${(c || '(vazio)').padEnd(13)} app=${app} servidor=${srv}`)
}
ok(validos.every(c => isValidCPF(c)), 'CPFs com dígito certo são aceitos')
ok(invalidos.every(c => !isValidCPF(c)), 'repetidos, curtos, longos e dígito errado são recusados')

console.log('\n=== app e servidor calculam o MESMO hash ===')
for (const c of validos) {
  const app = await hashCpf(formatCPF(c))     // o app recebe formatado
  const srv = servidor.hashCpf(c)             // o servidor recebe só dígitos
  ok(app === srv, `${formatCPF(c)} -> ${app.slice(0, 16)}...`)
}
ok(/^[a-f0-9]{64}$/.test(await hashCpf(validos[0])), 'hash no formato que a regra exige (64 hex)')
ok(await hashCpf('123.456.789-09') === await hashCpf('12345678909'), 'pontuação não muda o hash')

console.log('\n=== apresentação ===')
ok(digitosCpf('123.456.789-09') === '12345678909', 'só dígitos')
ok(nomeProprio('LUCAS SILVEIRA DE MELO') === 'Lucas Silveira de Melo', 'nome em maiúsculas vira nome próprio')
ok(nomeProprio('  maria  DAS  dores ') === 'Maria das Dores', 'espaços sobrando somem')
ok(nomeProprio('DE SOUZA') === 'De Souza', 'partícula no começo fica maiúscula')
ok(dataBR('1985-07-15') === '15/07/1985', 'nascimento em formato brasileiro')
ok(dataBR('15/07/1985') === null && dataBR(null) === null, 'formato inesperado vira null')

console.log(`\n${erros === 0 ? 'cpf consistente entre app e servidor' : erros + ' problema(s)'}`)
process.exit(erros ? 1 : 0)
