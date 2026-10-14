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

/**
 * Código da tela de uma rota: o arquivo da página e os componentes
 * locais que ela importa (um nível). Sai de App.jsx:
 *   <Route path="/x" element={<Guarda><Pagina /></Guarda>} />
 *   const Pagina = lazy(() => import('./pages/.../Pagina'))
 */
function codigoDaRota(rota) {
  const linha = app.split('\n').find(l => l.includes(`path="${rota}"`)) || ''
  const nomes = [...linha.matchAll(/<([A-Z]\w+)\s*\/>/g)].map(x => x[1])
  let codigo = ''
  for (const nome of nomes) {
    const imp = app.match(new RegExp(`const ${nome}\\s*=\\s*lazy\\(\\(\\) => import\\('([^']+)'\\)\\)`))
    if (!imp) continue
    const arq = path.join('src', imp[1]) + '.jsx'
    if (!fs.existsSync(arq)) continue
    const pagina = fs.readFileSync(arq, 'utf8')
    codigo += pagina
    for (const [, rel] of pagina.matchAll(/from '(\.{1,2}\/[^']+)'/g)) {
      const dep = path.join(path.dirname(arq), rel) + (rel.endsWith('.jsx') ? '' : '.jsx')
      if (fs.existsSync(dep)) codigo += fs.readFileSync(dep, 'utf8')
    }
  }
  return codigo
}

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
    } else if (!codigoDaRota(m.rota).includes(`data-coach="${nome}"`)) {
      // Existir em OUTRA tela não serve: o "Ir e mostrar" chegava em
      // /pending-requests procurando um alvo que só existe no Painel.
      falha(`${m.chave}: data-coach="${nome}" não está na tela de ${m.rota}`)
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
