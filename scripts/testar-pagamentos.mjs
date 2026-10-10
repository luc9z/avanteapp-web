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

console.log('\n=== catálogo do servidor = catálogo do app ===')
const admin = fs.readFileSync('src/pages/admin/AdminPage.jsx', 'utf8')
for (const p of pg.PLANOS_PADRAO) {
  const m = new RegExp(`id: '${p.id}'[^}]*?price: ([\\d.]+)`).exec(admin)
  ok(m && Number(m[1]) === p.price, `${p.id}: app ${m ? m[1] : '?'} = servidor ${p.price}`)
}
ok(pg.planoDoCatalogo(null, 'premium')?.price === 59.9, 'sem config/plans (banco resetado): usa o padrão')
ok(pg.planoDoCatalogo([{ id: 'premium', price: 79.9 }], 'premium').price === 79.9, 'com config/plans: vale o do admin')
ok(pg.planoDoCatalogo(null, 'inexistente') === null, 'plano inventado não existe')

console.log(`\n${erros === 0 ? 'regras de pagamento consistentes' : erros + ' problema(s)'}`)
process.exit(erros ? 1 : 0)
