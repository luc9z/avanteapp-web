/**
 * Regras de dinheiro dos planos (functions/pagamentos.js).
 *
 * Erro aqui não aparece na tela: aparece como cliente cobrado a mais, plano
 * que não vence, ou renovação que come dias já pagos.
 *
 *   npm run test:pagamentos
 */
import { createRequire } from 'module'
import fs from 'fs'

const require = createRequire(import.meta.url)
const pg = require('../functions/pagamentos.js')

let erros = 0
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok    ' : 'FALHOU'} ${msg}`); if (!cond) erros++ }
const DIA = 864e5
const AGORA = Date.UTC(2026, 9, 9, 12)

console.log('=== quanto se cobra ===')
ok(pg.valorEmCentavos(59.9, 'mensal') === 5990, 'Premium mensal: R$ 59,90')
ok(pg.valorEmCentavos(59.9, 'anual') === 59900, 'Premium anual: 10 meses, R$ 599,00')
ok(pg.valorEmCentavos(29.9, 'anual') === 29900, 'Essencial anual: R$ 299,00')
ok(pg.valorEmCentavos(59.9, 'mensal', 50) === 2995, 'cupom de 50%: R$ 29,95')
ok(pg.valorEmCentavos(59.9, 'mensal', 150) === 0, 'desconto acima de 100% não vira valor negativo')
ok(pg.valorEmCentavos(59.9, 'qualquer-coisa') === 5990, 'período desconhecido vira mensal (nunca cobra 10x por engano)')

console.log('\n=== até quando vale ===')
const novo = pg.novaExpiracao({ agora: AGORA, expiraAtual: null, planoAtual: 'free', planoNovo: 'premium', periodo: 'mensal' })
ok(novo.getTime() === AGORA + 30 * DIA, 'primeira assinatura mensal: 30 dias a partir de agora')
ok(pg.novaExpiracao({ agora: AGORA, planoAtual: 'free', planoNovo: 'premium', periodo: 'anual' }).getTime() === AGORA + 365 * DIA,
  'anual: 365 dias')
const faltam10 = new Date(AGORA + 10 * DIA)
ok(pg.novaExpiracao({ agora: AGORA, expiraAtual: faltam10, planoAtual: 'premium', planoNovo: 'premium', periodo: 'mensal' }).getTime()
  === faltam10.getTime() + 30 * DIA, 'renovou antes de vencer: os 10 dias que faltavam não se perdem')
ok(pg.novaExpiracao({ agora: AGORA, expiraAtual: new Date(AGORA - 5 * DIA), planoAtual: 'premium', planoNovo: 'premium', periodo: 'mensal' }).getTime()
  === AGORA + 30 * DIA, 'renovou depois de vencido: conta de agora, não do passado')
ok(pg.novaExpiracao({ agora: AGORA, expiraAtual: faltam10, planoAtual: 'essencial', planoNovo: 'premium', periodo: 'mensal' }).getTime()
  === AGORA + 30 * DIA, 'trocou de plano: o novo começa agora')

console.log('\n=== o pagamento confere? (com o NOSSO registro, não com o webhook) ===')
const reg = { centavos: 5990 }
ok(pg.pagamentoConfere({ status: 'PAID', paidAmount: 5990 }, reg).ok, 'pago o valor exato: confere')
ok(!pg.pagamentoConfere({ status: 'PENDING', paidAmount: null }, reg).ok, 'ainda pendente: NÃO ativa (webhook forjado)')
ok(!pg.pagamentoConfere({ status: 'PAID', paidAmount: 100 }, reg).ok, 'pagou menos que o plano: NÃO ativa')
ok(!pg.pagamentoConfere({ status: 'REFUNDED', paidAmount: 5990 }, reg).ok, 'estornado: NÃO ativa')
ok(pg.pagamentoConfere({ status: 'PAID', amount: 5990 }, reg).ok, 'sem paidAmount, usa o amount')
ok(!pg.pagamentoConfere(null, reg).ok, 'sem resposta da AbacatePay: NÃO ativa')

console.log('\n=== pagar o mesmo plano de novo ===')
const dia = d => new Date(AGORA + d * DIA)
ok(pg.podePagar({ agora: AGORA, planoAtual: 'free', planoNovo: 'premium' }).ok, 'Free para Premium: pode')
ok(pg.podePagar({ agora: AGORA, planoAtual: 'essencial', expiraAtual: dia(20), planoNovo: 'premium' }).ok, 'trocar de plano: pode')
ok(!pg.podePagar({ agora: AGORA, planoAtual: 'essencial', expiraAtual: dia(29), planoNovo: 'essencial' }).ok, 'mesmo plano com 29 dias: NÃO pode')
ok(!pg.podePagar({ agora: AGORA, planoAtual: 'essencial', expiraAtual: dia(5.5), planoNovo: 'essencial' }).ok, 'mesmo plano com 5,5 dias: ainda não')
ok(pg.podePagar({ agora: AGORA, planoAtual: 'essencial', expiraAtual: dia(5), planoNovo: 'essencial' }).ok, 'mesmo plano com 5 dias: pode renovar')
ok(pg.podePagar({ agora: AGORA, planoAtual: 'premium', expiraAtual: dia(-1), planoNovo: 'premium' }).ok, 'mesmo plano já vencido: pode')
ok(!pg.podePagar({ agora: AGORA, planoAtual: 'premium', expiraAtual: null, planoNovo: 'premium' }).ok, 'plano de cupom (sem vencimento): NÃO paga o mesmo')
const telaPlanos = fs.readFileSync('src/pages/professional/PlansPage.jsx', 'utf8')
const janelaApp = Number((telaPlanos.match(/const JANELA_RENOVACAO = (\d+)/) || [])[1])
ok(janelaApp === pg.JANELA_RENOVACAO_DIAS, `janela de renovação: app ${janelaApp} = servidor ${pg.JANELA_RENOVACAO_DIAS}`)

console.log('\n=== para onde o checkout devolve ===')
ok(pg.origemSegura('https://avante.vet.br') === 'https://avante.vet.br', 'domínio oficial passa')
ok(pg.origemSegura('http://localhost:5173') === 'http://localhost:5173', 'localhost (desenvolvimento) passa')
ok(pg.origemSegura('https://site-falso.com') === 'https://avante.vet.br', 'domínio de fora vira o oficial')
ok(pg.origemSegura('https://avante.vet.br.golpe.com') === 'https://avante.vet.br', 'imitação do domínio vira o oficial')

console.log('\n=== Vet Fundador ===')
const H = 3600 * 1000
ok(pg.atendimentoConta({ status: 'finalizado', confirmFinish_client: true }, AGORA), 'finalizado e confirmado pelo cliente: conta')
ok(!pg.atendimentoConta({ status: 'finalizado', confirmFinish_client: false, finalizedAt: new Date(AGORA - 47 * H) }, AGORA),
  'finalizado há 47h sem confirmação: ainda não conta')
ok(pg.atendimentoConta({ status: 'finalizado', confirmFinish_client: false, finalizedAt: new Date(AGORA - 49 * H) }, AGORA),
  'finalizado há 49h sem resposta do cliente: conta')
ok(!pg.atendimentoConta({ status: 'em_andamento', confirmFinish_client: true }, AGORA), 'em andamento: não conta')
ok(!pg.atendimentoConta({ status: 'finalizado', paymentReceived: true }, AGORA), 'só a marca do vet, sem cliente nem 48h: não conta')
const ENTROU = new Date(AGORA - 5 * DIA)
ok(!pg.atendimentoConta({ status: 'finalizado', confirmFinish_client: true, finalizedAt: new Date(AGORA - 9 * DIA) }, AGORA, ENTROU),
  'concluído ANTES de entrar no Fundador: não conta')
ok(pg.atendimentoConta({ status: 'finalizado', confirmFinish_client: true, finalizedAt: new Date(AGORA - 1 * DIA) }, AGORA, ENTROU),
  'concluído depois de entrar: conta')
ok(!pg.atendimentoConta({ status: 'finalizado', confirmFinish_client: true }, AGORA, ENTROU),
  'sem data nenhuma, com adesão registrada: não conta (não dá para provar que é novo)')
const fund = { fundador: { price: 29.9, mesesTravado: 12 }, fundadorTrialEndedAt: new Date(AGORA - 10 * DIA) }
ok(pg.precoFundador({ usuario: fund, planId: 'premium', periodo: 'mensal', agora: AGORA }) === 29.9, 'fundador que bateu a meta: Premium mensal a R$ 29,90')
ok(pg.precoFundador({ usuario: fund, planId: 'premium', periodo: 'anual', agora: AGORA }) === null, 'anual: preço normal')
ok(pg.precoFundador({ usuario: fund, planId: 'essencial', periodo: 'mensal', agora: AGORA }) === null, 'outro plano: preço normal')
ok(pg.precoFundador({ usuario: { fundador: { price: 29.9 } }, planId: 'premium', periodo: 'mensal', agora: AGORA }) === null,
  'ainda no período grátis: não há o que cobrar')
ok(pg.precoFundador({ usuario: { ...fund, fundadorTrialEndedAt: new Date(AGORA - 400 * DIA) }, planId: 'premium', periodo: 'mensal', agora: AGORA }) === null,
  'passados os 12 meses: volta ao preço normal')
ok(pg.FUNDADOR.carenciaDias <= pg.JANELA_RENOVACAO_DIAS, 'a carência cabe na janela de renovação (o vet consegue pagar na hora)')
const vagasApp = fs.readFileSync('src/utils/paidVisits.js', 'utf8')
for (const [nome, chave] of [['FUNDADOR_TRIAL_VISITS', 'visitasGratis'], ['FUNDADOR_PRICE', 'preco'], ['FUNDADOR_SLOTS', 'vagas']]) {
  const v = Number((vagasApp.match(new RegExp(`${nome} = ([\\d.]+)`)) || [])[1])
  ok(v === pg.FUNDADOR[chave], `${nome}: app ${v} = servidor ${pg.FUNDADOR[chave]}`)
}

console.log('\n=== catálogo do servidor = catálogo do app ===')
const admin = fs.readFileSync('src/pages/admin/AdminPage.jsx', 'utf8')
for (const p of pg.PLANOS_PADRAO) {
  const m = new RegExp(`id: '${p.id}'[^}]*?price: ([\\d.]+)`).exec(admin)
  ok(m && Number(m[1]) === p.price, `${p.id}: app ${m ? m[1] : '?'} = servidor ${p.price}`)
}
ok(pg.planoDoCatalogo(null, 'premium')?.price === 49.9, 'sem config/plans (banco resetado): usa o padrão')
ok(pg.planoDoCatalogo([{ id: 'premium', price: 79.9 }], 'premium').price === 79.9, 'com config/plans: vale o do admin')
ok(pg.planoDoCatalogo(null, 'inexistente') === null, 'plano inventado não existe')

console.log('\n=== assinatura recorrente (Cakto) ===')
const C = pg.CARENCIA_ASSINATURA_DIAS
const primeira = pg.novaExpiracao({ agora: AGORA, planoAtual: 'free', planoNovo: 'premium', periodo: 'mensal', carenciaDias: C })
ok(primeira.getTime() === AGORA + (30 + C) * DIA, `primeira cobrança: 30 dias + ${C} de folga para a renovação chegar`)
const renovada = pg.novaExpiracao({ agora: AGORA + 30 * DIA, expiraAtual: primeira, planoAtual: 'premium', planoNovo: 'premium', periodo: 'mensal', carenciaDias: C })
ok(renovada.getTime() === primeira.getTime() + 30 * DIA, 'renovação: +30 dias sobre o vencimento, sem somar a folga de novo')
let venc = primeira
for (let mes = 1; mes <= 12; mes++) {
  venc = pg.novaExpiracao({ agora: AGORA + mes * 30 * DIA, expiraAtual: venc, planoAtual: 'premium', planoNovo: 'premium', periodo: 'mensal', carenciaDias: C })
}
ok(venc.getTime() === AGORA + (13 * 30 + C) * DIA, '12 renovações: a folga continua sendo só a do começo (não vira mês grátis)')
ok(pg.novaExpiracao({ agora: AGORA, planoAtual: 'free', planoNovo: 'premium', periodo: 'anual', carenciaDias: C }).getTime()
  === AGORA + (365 + C) * DIA, 'anual: 365 dias + folga')

const catalogoCakto = [
  { id: 'free', price: 0 },
  { id: 'essencial', price: 29.9, caktoOfertas: { mensal: 'ess-m', anual: 'ess-a' } },
  { id: 'premium', price: 49.9, caktoOfertas: { mensal: ' prem-m ', anual: 'prem-a', fundador: 'prem-f' } },
]
const [, essencial, premium] = catalogoCakto
ok(pg.ofertaCakto(premium, 'mensal') === 'prem-m', 'Premium mensal → oferta mensal (sem espaços)')
ok(pg.ofertaCakto(premium, 'anual') === 'prem-a', 'Premium anual → oferta anual')
ok(pg.ofertaCakto(premium, 'mensal', true) === 'prem-f', 'Fundador → oferta de preço travado')
ok(pg.ofertaCakto(essencial, 'mensal', true) === null, 'sem oferta de Fundador: não cai na oferta cheia sem querer')
ok(pg.ofertaCakto({ id: 'x', caktoOfertas: { mensal: 'a/b?c' } }, 'mensal') === null, 'ID com caractere estranho é recusado')
ok(pg.ofertaCakto(premium, 'qualquer') === 'prem-m', 'período desconhecido vira mensal')
ok(JSON.stringify(pg.planoDaOferta(catalogoCakto, 'prem-a')) === JSON.stringify({ planId: 'premium', periodo: 'anual', fundador: false }),
  'oferta anual paga libera Premium anual')
ok(pg.planoDaOferta(catalogoCakto, 'prem-f')?.planId === 'premium' && pg.planoDaOferta(catalogoCakto, 'prem-f').periodo === 'mensal',
  'oferta de Fundador libera Premium mensal')
ok(pg.planoDaOferta(catalogoCakto, 'ess-m')?.planId === 'essencial', 'pagou a oferta do Essencial: é Essencial, qualquer que fosse o link')
ok(pg.planoDaOferta(catalogoCakto, 'outra-oferta') === null, 'oferta que não é do AVANTE não libera nada')
ok(pg.planoDaOferta(null, 'prem-m') === null, 'sem config/plans não há oferta conhecida')

console.log(`\n${erros === 0 ? 'regras de pagamento consistentes' : erros + ' problema(s)'}`)
process.exit(erros ? 1 : 0)
