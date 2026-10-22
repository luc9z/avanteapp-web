# AVANTE · comece aqui

**Veredito: ainda não.** O app só vira negócio se tutores de Santiago pedirem atendimento por ele. Novembro é o teste que prova isso, gastando no máximo R$ 500 e sem abrir empresa antes.

**A oferta para o vet, em uma frase:** *"Premium grátis até você fechar 3 atendimentos pagos pelo app; depois R$ 29,90 por mês, travado por 12 meses. Sem comissão. 30 vagas."*

**Para quem divulgar:** tutores de cães e gatos na cidade. O campo fica para depois.

## O que fazer, em ordem

> **Correção de 22/10.** A primeira versão destes documentos foi feita a partir de um código antigo (de junho) e mandava ativar planos à mão no admin e cobrar PIX direto. O app real já tem um servidor gratuito (Cloudflare Workers) que cobra por PIX e cartão (AbacatePay) e ativa o plano sozinho. O Vet Fundador também é automático. **Não publique a branch `claude/elegant-ramanujan-crigci`**: ela apagaria do site o pagamento, o CPF, a marca nova e a versão para computador.

- [ ] **Publicar o app novo** a partir da branch `integra-nuvem` (ela junta o trabalho da nuvem com o app real). No PowerShell, na pasta `avanteapp-web`:
  `npm run build` · `npx firebase deploy --only firestore:rules,hosting --project avante-pro`
  e o servidor, na pasta `avanteapp-web\worker`: `npx wrangler deploy`
- [ ] **Admin**: você já é admin.
- [ ] **Cupons**: o BEMVINDO deixou de existir (ele dava Premium grátis para sempre a quem digitasse). Cupom agora só vale se você criar em `config/coupons` pelo admin. Veja no Firestore quem tem `planCoupon: BEMVINDO` e decida se mantém.
- [ ] **Testar com duas contas suas**: na tela de Planos, o vet toca em "Quero ser Vet Fundador" (ativa na hora, sem você fazer nada); o cliente faz um pedido; o vet finaliza; o cliente confirma. O painel do vet tem que mostrar "1 de 3".
- [ ] **Antes de cobrar alguém (até 13/12)**: a conta da AbacatePay precisa estar aprovada e a chave de produção trocada no servidor. Hoje ela está em modo de teste.
- [ ] **Até 01/11**: lista de vets de Santiago (consulta de inscritos do CRMV-RS, clínicas, curso de Veterinária da URI).
- [ ] **02 a 06/11**: visitar 15 vets e fechar os 10 primeiros Vets Fundadores. Cadastre cada um na hora, com foto e raio de atendimento, e toque com ele em "Quero ser Vet Fundador".
- [ ] **05 a 13/11**: cartazes com QR code em 4 pet shops e 2 agropecuárias; pauta para a rádio local; posts da lista de espera.
- [ ] **14/11 (sábado)**: 5 tutores conhecidos fazem pedidos de verdade. Acompanhe cada um e anote onde travam.
- [ ] **16/11 (segunda)**: abertura em Santiago. Anúncio na Meta a R$ 10 por dia.
- [ ] **Todo pedido novo**: avise o vet pelo WhatsApp em até 1 hora (o app ainda não manda aviso para o celular do vet com o app fechado; dá para fazer pelo servidor, é o próximo passo técnico).
- [ ] **Revisões**: 23/11, 30/11 e **decisão em 13/12**.

### Como o Vet Fundador funciona no app

| o quê | como fica |
| --- | --- |
| Entrar | O vet toca em "Quero ser Vet Fundador" na tela de Planos. O servidor confere a vaga (30, em `config/fundador`) e ativa o Premium grátis na hora. |
| Contar os 3 atendimentos | Conta o pedido finalizado **depois** da adesão e confirmado pelo cliente (ou sem resposta dele em 48h). O "Recebi o pagamento" do vet serve para medir visitas pagas, mas não entra na conta: quem está no grátis ganharia deixando de marcar. O servidor confere uma vez por dia. |
| Fim do período grátis | Na meta, o plano ganha 5 dias para o vet pagar R$ 29,90 por PIX ou cartão, travado por 12 meses. Sem pagamento, volta ao Free sozinho. |
| Fechar as inscrições | Em `config/fundador`, mude `vagas` ou ponha uma data em `fechaEm`. |

## Toda sexta, olhe 3 números

| número | meta | se ficar abaixo |
| --- | --- | --- |
| Pedidos de tutores na semana | 8 ou mais | menos de 3: troque o anúncio |
| Pedidos aceitos por um vet em até 2h | 70% | menos de 50%: falta vet ou aviso |
| Atendimentos realizados e pagos | 3 ou mais na semana 3 | é o número que decide tudo |

## A decisão de 13/12

- **Passou** (10 vets ativos, 30 pedidos, 12 atendimentos pagos): abrir o CNPJ, ativar a chave de produção da AbacatePay (os Fundadores que bateram 3 atendimentos pagam pelo próprio app) e baixar a divulgação para R$ 200 por mês.
- **Não passou**: não abrir empresa e não gastar mais. Rever a proposta para o tutor antes de tentar de novo.

## Os números, se alguém perguntar

Cada vet pagante deixa R$ 24,47 por mês (já com a taxa de R$ 0,80 do PIX). O equilíbrio é **28 vets pagando**. O primeiro ano fecha em cerca de **-R$ 6.700**, ou **-R$ 3.100** com a divulgação a R$ 200 por mês depois do lançamento. Uma cidade só não sustenta o negócio: Santiago é o teste.

## Onde está o resto (só se precisar)

| pasta ou arquivo | para quê |
| --- | --- |
| `manual/` | o passo a passo detalhado: `lancamento.md` (datas), `marketing.md` (anúncios e textos), `operacao.md` (rotina, publicar, riscos), `marca.md` (nome e cores) |
| `analise/` | por que decidimos assim: conselho, concorrentes, preço, oferta e financeiro |
| `uma-pagina.md` | resumo para mostrar a um sócio ou parceiro |
| `plano-completo.md` | tudo junto num documento só |
| `dados/` | arquivos das ferramentas (painéis simulados, números). Não precisa abrir. |

_Os vets do painel são simulados e os números são projeções; só o teste de novembro confirma. Não é assessoria financeira, jurídica nem fiscal._
