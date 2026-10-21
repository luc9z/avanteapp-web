# CFO: nota

> Moeda: todos os valores abaixo estão em **reais** (a ferramenta imprime "$"). A unidade é **1 vet pagante por 1 mês**: onde o relatório diz "a day", leia "por mês".

**Premissa nova: sem o plano Blaze.** O app fica no plano gratuito do Firebase (Spark): R$ 0 de hospedagem e banco, mas **sem Cloud Functions**. Então não há checkout automático: o vet pede o plano no app, paga por **PIX direto na sua conta** e você ativa no painel /admin. Não há taxa de gateway (estimativa: PIX recebido de graça num banco digital).

- **A margem**: cada vet pagante deixa **R$ 25,27/mês** depois do imposto (85% de contribuição a R$ 29,90). O custo fixo é **R$ 674/mês** e o **ponto de equilíbrio é 27 vets pagando**, quase as 30 vagas de Fundador.
- **A linha que mais pesa**: a divulgação (R$ 500 dos R$ 674). Com R$ 200/mês depois do lançamento, o equilíbrio cai para **15 vets** e o prejuízo do ano 1 cai de R$ 6.692 para **R$ 3.092**. Cortar custo fixo move mais que crescer.
- **Caixa**: com o plano base, o fundador precisa de **R$ 7.792** até o fim do ano 1, sem salário para si (R$ 4.192 com a divulgação a R$ 200).
- **Teto do mercado**: mesmo com 30 vets a R$ 49,90, a receita fica perto de R$ 1.500/mês. **Assinatura de vet numa cidade só não sustenta o negócio**; Santiago é cidade-teste, e o modelo precisa de mais cidades ou de outra receita.

**Três jeitos de melhorar a margem** (testados na ferramenta):
1. Divulgação de R$ 500 só no mês do teste e do lançamento, depois R$ 200: equilíbrio em 15 vets, ano 1 com -R$ 3.092.
2. Confirmar com o contador o Anexo III (6%) em vez do Anexo V (15,5%): junto com o item 1, equilíbrio em 14 vets, ano 1 com -R$ 2.936.
3. Premium a R$ 49,90 depois dos 12 meses travados: equilíbrio em 16 vets (aparece no ano 2).

**O custo escondido do plano grátis**: a cobrança e a ativação são manuais. Para 30 vets, é perto de 1 hora por mês conferindo PIX e tocando em "PIX recebido" no admin. Sem Cloud Functions também não há notificação push quando o app está fechado (o vet só é avisado com o app aberto), o que pesa no concierge por WhatsApp (ops.md).

**Condições do conselho sobre dinheiro**: não atendidas. O ano 1 não se paga, e a demanda ainda não foi provada. A lente Ofertas pede CNPJ e cobrança antes de pagar divulgação; o plano deixa o CNPJ para depois do teste de novembro porque no teste ninguém paga (o Fundador só paga depois de 3 atendimentos), e assim os R$ 1.100 de abertura só saem se houver demanda. Este relatório já conta contador e imposto desde o mês 1, então é conservador.

Estimativas que precisam de orçamento real (ver cfo-sources.md): imposto, contador, Groq, abertura do CNPJ, gráfica e advogado. Não é assessoria contábil nem fiscal: o contador confirma o enquadramento, o CNAE e o pró-labore antes de abrir a empresa.

---

# Unit economics: AVANTE, Santiago RS (unidade = 1 vet pagante por 1 mês; 'a day' no relatório = 'por mês')

Every number below comes from the input file. Nothing is looked up or guessed.

## One vet-mês

| line | per vet-mês |
| --- | ---: |
| Price | $29.90 |
| Imposto Simples Nacional (estimativa conservadora: Anexo V, 15,5%) | -$4.63 |
| PIX recebido direto na conta da empresa (estimativa: grátis no banco digital) | -$0.00 |
| **Contribution** (what each vet-mês leaves to pay the fixed costs) | **$25.27** (85%) |

## The margin that matters

Fixed costs: $674 a month (Divulgação local (definido pelo fundador) $500, Contador online para ME no Simples (estimativa) $150, Firebase no plano gratuito Spark (sem Cloud Functions) $0, API de IA da triagem, Groq (estimativa) $20, Domínio .com.br (R$ 40/ano) $4).

- **Break-even: 27 vet-mêss a day.** Below that you lose money every month.
- **Profit margin at your plan** (10 a day): **-141%** of every sale, after every cost.
- Capacity: 30 a day.

## Year 1, month by month

| month | vet-mêss a day | revenue | profit | cumulative (after $1,100 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | $0 | -$674 | -$1,774 |
| 2 | 0 | $0 | -$674 | -$2,447 |
| 3 | 1 | $30 | -$648 | -$3,095 |
| 4 | 2 | $60 | -$623 | -$3,718 |
| 5 | 3 | $90 | -$598 | -$4,316 |
| 6 | 4 | $120 | -$572 | -$4,888 |
| 7 | 5 | $150 | -$547 | -$5,435 |
| 8 | 6 | $179 | -$522 | -$5,957 |
| 9 | 7 | $209 | -$497 | -$6,454 |
| 10 | 8 | $239 | -$471 | -$6,925 |
| 11 | 9 | $269 | -$446 | -$7,371 |
| 12 | 10 | $299 | -$421 | -$7,792 |

- **Year 1 operating profit: -$6,692** on $1,644 of revenue.
- After the $1,100 startup spend: -$7,792.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$7,792**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | -141% | 27 | -$6,692 |
| Price -10% | -167% | 31 | -$6,857 |
| Volume -20% | -197% | 27 | -$6,970 |
| Unit costs +15% | -143% | 28 | -$6,730 |

## Red flags

- Year 1 loses money on operations (-$6,692).
- The startup spend is not earned back within year 1.
