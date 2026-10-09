/**
 * A origem do cadastro decide em que canal vale gastar tempo de
 * divulgação. Errar aqui não quebra tela nenhuma: só faz o quadro do
 * admin mentir em silêncio. Por isso o teste.
 *
 *   npm run test:origem
 */
import {
  lerMarcacoes, juntarOrigem, origemParaGravar, canalDe, nomeDoCanal,
  limparCodigo, montarLink,
} from '../src/utils/origem.js'

let erros = 0
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok    ' : 'FALHOU'} ${msg}`); if (!cond) erros++ }

console.log('=== leitura da URL ===')
ok(lerMarcacoes('') === null, 'visita sem marcação não guarda nada')
ok(lerMarcacoes('?foo=1') === null, 'parâmetro qualquer não conta como origem')
const ig = lerMarcacoes('?utm_source=Instagram&utm_medium=bio')
ok(ig?.utm_source === 'instagram' && ig?.utm_medium === 'bio', 'utm lido e em minúsculas')
ok(lerMarcacoes('?ref=ana8421')?.ref === 'ANA8421', 'código de indicação em maiúsculas')
const lixo = lerMarcacoes('?ref=<script>alert(1)</script>')?.ref
ok(!lixo || /^[A-Z0-9]+$/.test(lixo), `código com lixo só guarda letras e números (${lixo})`)
ok(juntarOrigem(null, { ref: 'X' }, '/a/<b>').pagina === '/a/b', 'caminho perde o lixo mas mantém as barras')
ok(juntarOrigem(null, { ref: 'X' }, 'javascript:x').pagina === '/', 'caminho que não começa com / vira /')
ok(lerMarcacoes('?utm_source=' + 'x'.repeat(500))?.utm_source.length === 40, 'valor gigante é cortado')
ok(lerMarcacoes('?utm_source=a%22%3E%3Cimg')?.utm_source === 'aimg', 'caracteres de HTML somem')

console.log('\n=== primeira visita vs. visita seguinte ===')
const t0 = '2026-10-01T10:00:00.000Z'
const primeira = juntarOrigem(null, lerMarcacoes('?utm_source=instagram&utm_medium=bio'), '/conheca', t0)
ok(primeira.utm_source === 'instagram' && primeira.pagina === '/conheca' && primeira.em === t0, 'primeira visita guarda canal, página e hora')

const depoisWhats = juntarOrigem(primeira, lerMarcacoes('?utm_source=whatsapp'), '/login')
ok(depoisWhats.utm_source === 'instagram', 'canal é da PRIMEIRA visita (Instagram continua)')
ok(depoisWhats.pagina === '/conheca' && depoisWhats.em === t0, 'página e hora também ficam as da primeira')

const comRef = juntarOrigem(depoisWhats, lerMarcacoes('?ref=BRUN1234'), '/conheca')
ok(comRef.ref === 'BRUN1234', 'indicação chega depois e vale')
const outroRef = juntarOrigem(comRef, lerMarcacoes('?ref=CARL5678'), '/conheca')
ok(outroRef.ref === 'CARL5678', 'indicação é da ÚLTIMA (link de colega é pedido explícito)')
ok(juntarOrigem(comRef, null, '/x') === comRef, 'visita sem marcação não mexe na origem')

console.log('\n=== o que vai para o banco ===')
ok(origemParaGravar(null).canal === 'direto', 'sem origem guardada: canal "direto"')
const gravada = origemParaGravar({ ...comRef, intencao: 'vet' })
ok(gravada.canal === 'indicacao', 'indicação vence o utm no canal')
ok(gravada.utm_source === 'instagram', 'mas o utm continua registrado')
ok(gravada.intencao === 'vet', 'botão clicado na apresentação vai junto')
ok(Object.values(gravada).every(v => v != null && v !== ''), 'nenhum campo vazio é gravado')

console.log('\n=== nomes no quadro do admin ===')
ok(canalDe({ utm_source: 'faculdade' }) === 'faculdade', 'canal vem do utm_source')
ok(nomeDoCanal('indicacao') === 'Indicação de colega', 'indicação tem nome legível')
ok(nomeDoCanal('podcast') === 'Podcast', 'canal desconhecido ganha inicial maiúscula')
ok(nomeDoCanal(undefined) === 'Antes da medição', 'conta antiga tem nome próprio')

console.log('\n=== códigos e links ===')
ok(limparCodigo('abc') === null, 'código curto demais é recusado')
ok(limparCodigo('joão1234') === 'JOO1234', 'acento some, resto fica')
const link = montarLink('https://avante.vet.br', { canal: 'Instagram', meio: 'Story', campanha: 'recem formados' })
ok(link === 'https://avante.vet.br/conheca?utm_source=instagram&utm_medium=story&utm_campaign=recemformados',
  `link marcado: ${link}`)
ok(montarLink('https://avante.vet.br', {}) === 'https://avante.vet.br/conheca', 'sem nada vira só a página')

console.log(`\n${erros === 0 ? 'origem consistente' : erros + ' problema(s)'}`)
process.exit(erros ? 1 : 0)
