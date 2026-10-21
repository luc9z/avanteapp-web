# CFO: nota

> Moeda: todos os valores abaixo estão em **reais** (a ferramenta imprime "$"). A unidade é **1 vet pagante por 1 mês**: onde o relatório diz "a day", leia "por mês".

- **A margem**: cada vet pagante deixa **R$ 24,27/mês** depois do imposto e da taxa do PIX (81% de contribuição a R$ 29,90). O problema não é a margem por vet, é a escala: o custo fixo é R$ 704/mês e o **ponto de equilíbrio é 29 vets pagando**, praticamente as 30 vagas de Fundador.
- **A linha que mais pesa**: a divulgação (R$ 500 dos R$ 704). Com R$ 200/mês de divulgação depois do lançamento, o ponto de equilíbrio cai para 17 vets e o prejuízo do ano 1 cai de R$ 7.107 para R$ 3.507. Dobrar o ritmo de vets pagantes, mantendo R$ 500, reduz o prejuízo só para R$ 5.772. Cortar custo fixo move mais que crescer.
- **Caixa**: com o plano base, o fundador precisa de **R$ 8.207** até o fim do ano 1, sem salário para si. O aporte inicial é R$ 1.100; o resto são os prejuízos mensais (R$ 461 a R$ 704 por mês).
- **Teto do mercado**: Santiago tem 49 mil habitantes. Mesmo com 30 vets a R$ 49,90, a receita máxima fica perto de R$ 1.500/mês. **Assinatura de vet numa cidade só não sustenta o negócio**; Santiago serve como cidade-teste, e o modelo precisa de mais cidades ou de outra receita para virar empresa.

**Três jeitos de melhorar a margem** (testados na ferramenta):
1. Divulgação de R$ 500 só no mês do teste e do lançamento, depois R$ 200: equilíbrio em 17 vets, ano 1 com -R$ 3.507.
2. Confirmar com o contador o enquadramento de 6% (Anexo III) em vez de 15,5%: junto com o item 1, equilíbrio em 15 vets, ano 1 com -R$ 3.351.
3. Premium a R$ 49,90 depois dos 12 meses travados: equilíbrio em 16 vets (no ano 1 quase não aparece, porque os Fundadores pagam R$ 29,90).

**Condições do conselho sobre dinheiro**: não atendidas. O ano 1 não se paga, e a demanda ainda não foi provada. A lente Ofertas pede CNPJ e cobrança antes de pagar divulgação; o plano deixa o CNPJ para depois do teste de novembro porque no teste ninguém paga (o Fundador só paga depois de 3 atendimentos), e assim os R$ 1.100 de abertura só saem se houver demanda. Este relatório já conta o contador e o imposto desde o mês 1, então é conservador.

**Preço**: os Fundadores pagam R$ 29,90 por 12 meses, então o ano 1 roda a esse preço. O Premium normal passou para R$ 49,90 (pricing.md); com ele, o equilíbrio cai para 18 vets, mas isso só aparece no ano 2.

Estimativas que precisam de orçamento real (ver cfo-sources.md): imposto, taxa do gateway, contador, Firebase, Groq, abertura do CNPJ, gráfica e advogado. Não é assessoria contábil nem fiscal: o contador confirma o enquadramento, o CNAE e o pró-labore antes de abrir a empresa.

---

# Unit economics: AVANTE, Santiago RS (unidade = 1 vet pagante por 1 mês; 'a day' no relatório = 'por mês')

Every number below comes from the input file. Nothing is looked up or guessed.

## One vet-mês

| line | per vet-mês |
| --- | ---: |
| Price | $29.90 |
| Imposto Simples Nacional (estimativa conservadora: Anexo V, 15,5%) | -$4.63 |
| Taxa da cobrança PIX no gateway (estimativa) | -$1.00 |
| **Contribution** (what each vet-mês leaves to pay the fixed costs) | **$24.27** (81%) |

## The margin that matters

Fixed costs: $704 a month (Divulgação local (definido pelo fundador) $500, Contador online para ME no Simples (estimativa) $150, Firebase Blaze + Cloud Functions (estimativa) $30, API de IA da triagem, Groq (estimativa) $20, Domínio .com.br (R$ 40/ano) $4).

- **Break-even: 29 vet-mêss a day.** Below that you lose money every month.
- **Profit margin at your plan** (10 a day): **-154%** of every sale, after every cost.
- Capacity: 30 a day.

## Year 1, month by month

| month | vet-mêss a day | revenue | profit | cumulative (after $1,100 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | $0 | -$704 | -$1,804 |
| 2 | 0 | $0 | -$704 | -$2,507 |
| 3 | 1 | $30 | -$679 | -$3,186 |
| 4 | 2 | $60 | -$655 | -$3,841 |
| 5 | 3 | $90 | -$631 | -$4,472 |
| 6 | 4 | $120 | -$606 | -$5,078 |
| 7 | 5 | $150 | -$582 | -$5,660 |
| 8 | 6 | $179 | -$558 | -$6,218 |
| 9 | 7 | $209 | -$534 | -$6,752 |
| 10 | 8 | $239 | -$509 | -$7,261 |
| 11 | 9 | $269 | -$485 | -$7,746 |
| 12 | 10 | $299 | -$461 | -$8,207 |

- **Year 1 operating profit: -$7,107** on $1,644 of revenue.
- After the $1,100 startup spend: -$8,207.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$8,207**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | -154% | 29 | -$7,107 |
| Price -10% | -182% | 34 | -$7,272 |
| Volume -20% | -213% | 29 | -$7,374 |
| Unit costs +15% | -157% | 31 | -$7,154 |

## Red flags

- Year 1 loses money on operations (-$7,107).
- The startup spend is not earned back within year 1.
