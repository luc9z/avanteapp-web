/**
 * Confere se o mapa da IA bate com o app de verdade.
 *
 * Existe porque na primeira versão eu escrevi caminhos por suposição:
 * "aba Animais" e "aba Solicitações" não existem na barra inferior, e a
 * IA passaria a mandar as pessoas procurarem abas inventadas - o
 * oposto do que o mapa serve para evitar.
 *
 * Rode depois de mexer em rotas, abas ou data-coach:
 *   npm run test:mapa
 */
import fs from 'fs'
import path from 'path'
import { MAPA, mapaDoPapel } from '../src/services/appMap.js'

function lerTudo(dir, acc = '') {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) acc = lerTudo(p, acc)
    else if (/\.jsx$/.test(f)) acc += fs.readFileSync(p, 'utf8')
  }
  return acc
}

const app = fs.readFileSync('src/App.jsx', 'utf8')
const src = lerTudo('src')
const nav = fs.readFileSync('src/components/common/BottomNav.jsx', 'utf8')

// As abas que existem de verdade na barra inferior.
const ABAS = new Set([...nav.matchAll(/label="([^"]+)"/g)].map(m => m[1]))

let erros = 0
const falha = msg => { console.log(`  FALHOU  ${msg}`); erros++ }

console.log(`mapa: ${MAPA.length} telas | abas reais: ${[...ABAS].join(', ')}\n`)

const chaves = new Set()
for (const m of MAPA) {
  if (chaves.has(m.chave)) falha(`chave repetida: ${m.chave}`)
  chaves.add(m.chave)

  if (!app.includes(`path="${m.rota}"`)) falha(`${m.chave}: rota ${m.rota} não existe em App.jsx`)

  if (!ABAS.has(m.aba)) falha(`${m.chave}: aba "${m.aba}" não é uma aba da barra inferior`)

  if (m.alvo) {
    const nome = m.alvo.match(/data-coach="([^"]+)"/)?.[1]
    if (!nome) falha(`${m.chave}: alvo mal formado (${m.alvo})`)
    else if (!src.includes(`data-coach="${nome}"`)) {
      falha(`${m.chave}: data-coach="${nome}" não existe em nenhuma tela`)
    }
  }

  if (!m.passos?.length) falha(`${m.chave}: sem passos`)
  if (!m.resumo) falha(`${m.chave}: sem resumo`)
  if (!['client', 'vet', 'ambos'].includes(m.papel)) falha(`${m.chave}: papel inválido`)
}

// Os dois papéis precisam ter mapa útil.
for (const papel of ['client', 'vet']) {
  const n = mapaDoPapel(papel).length
  if (n < 5) falha(`papel ${papel} tem só ${n} telas no mapa`)
  else console.log(`  ok      ${papel}: ${n} telas`)
}

console.log(`\n${erros === 0 ? 'mapa consistente com o app' : erros + ' problema(s)'}`)
process.exit(erros ? 1 : 0)
