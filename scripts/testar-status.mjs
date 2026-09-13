/**
 * Nenhuma tela pode mostrar a chave crua de um status.
 *
 * Este teste nasceu de um bug que se repetiu três vezes: cada tela tinha
 * seu próprio mapa de rótulos, e um status novo aparecia para o usuário
 * como "orcamento_recusado", direto do banco. Agora o rótulo sai de
 * statusInfo() e este script garante que continue assim.
 *
 *   npm run test:status
 */
import fs from 'fs'
import path from 'path'
import { STATUS_INFO, STATUS_ALIASES, statusInfo, normalizeStatus } from '../src/utils/status.js'

let erros = 0
const falha = m => { console.log(`  FALHOU  ${m}`); erros++ }
const ok = m => console.log(`  ok      ${m}`)

/* 1. Todo status canônico tem rótulo legível. */
const canonicos = Object.keys(STATUS_INFO)
for (const s of canonicos) {
  const l = statusInfo(s).label
  if (!l || l === s) falha(`${s}: rótulo ausente ou igual à chave`)
}
ok(`${canonicos.length} status com rótulo em português`)

/* 2. Os aliases desembocam num status conhecido. */
const ALIASES = ['pending', 'accepted', 'quote_pending', 'quote_rejected',
  'in_progress', 'done', 'on_the_way', 'cancelled', 'urgent']
for (const a of ALIASES) {
  const c = normalizeStatus(a)
  if (!STATUS_INFO[c]) falha(`alias "${a}" vira "${c}", que não tem rótulo`)
}
ok(`${ALIASES.length} aliases antigos continuam com rótulo`)

/* 3. Nenhuma tela mantém mapa de RÓTULO próprio.
      Cor e classe por tela tudo bem: o que não pode é o texto. */
function telas(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) telas(p, acc)
    else if (/\.jsx$/.test(f)) acc.push(p)
  }
  return acc
}

/* A busca sai do próprio vocabulário, não de uma lista de textos: um
   mapa por tela é livre para escrever "Pedido Aceito" em vez de
   "Aceito", e uma lista fixa de frases deixaria isso passar. */
const VOCABULARIO = new Set([
  ...Object.keys(STATUS_INFO),
  ...Object.values(STATUS_ALIASES).flat(),
])

/* O que caracteriza um mapa de selo é a CHAVE ser um status. Só "label:"
   conta como rótulo: "title:" é título de diálogo de confirmação e de
   cartão de aviso, que são texto da tela, não nome do status. */
const ABRE_ENTRADA = /^\s*['"]?([a-z_]+)['"]?:\s*\{/
const ROTULO = /\blabel:\s*['"`]/
/* Chip de filtro e legenda de gráfico nomeiam um GRUPO ("Em andamento"
   = vários status) e vêm com key/count/value. "color:" NÃO entra aqui:
   mapa de selo quebrado costuma ser { label, color }, o bug original. */
const ehGrupo = l => /key:|count:|value:/.test(l)

for (const f of telas('src')) {
  const linhas = fs.readFileSync(f, 'utf8').split('\n')
  linhas.forEach((linha, i) => {
    // 3a. status como chave de objeto que carrega um rótulo dentro
    const m = linha.match(ABRE_ENTRADA)
    if (m && VOCABULARIO.has(m[1])) {
      let saldo = 0
      for (let j = i; j < linhas.length && j - i < 12; j++) {
        saldo += (linhas[j].match(/\{/g) || []).length
        saldo -= (linhas[j].match(/\}/g) || []).length
        if (ROTULO.test(linhas[j]) && !ehGrupo(linhas[j])) {
          falha(`${f}:${j + 1} mapa de rótulo próprio (status "${m[1]}")`)
          break
        }
        if (saldo <= 0) break
      }
    }
    // 3b. a mesma linha testa o status e escreve o texto
    //     if (s === 'orcamento') return { label: 'Orçamento enviado' }
    if (ROTULO.test(linha) && !ehGrupo(linha) &&
        [...VOCABULARIO].some(s => linha.includes(`'${s}'`))) {
      falha(`${f}:${i + 1} rótulo de status escrito à mão`)
    }
  })
}
if (!erros) ok('nenhuma tela reescreve rótulo de status')

/* 4. Fallback: status desconhecido não vaza a chave para a tela. */
const desconhecido = statusInfo('status_que_nao_existe')
if (desconhecido.label === 'status_que_nao_existe') {
  falha('status desconhecido aparece cru para o usuário')
} else {
  ok(`status desconhecido vira "${desconhecido.label}"`)
}

console.log(`\n${erros === 0 ? 'status consistentes em todas as telas' : erros + ' problema(s)'}`)
process.exit(erros ? 1 : 0)
