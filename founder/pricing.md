# Preço

## 1. O que os vets disseram
40 respostas de preço (os mesmos 20 vets simulados de Santiago, nos dois pitches; curva em `pricing-curve.md`):

| ponto | preço/mês | o que significa |
| --- | ---: | --- |
| PMC | R$ 10 | abaixo disso, parece barato demais para ser bom |
| IPP | R$ 25 | tantos acham "pechincha" quanto "caro" |
| PME | **R$ 50** | acima disso, gente demais não compra |

**Faixa aceitável: R$ 10 a R$ 50.** Medianas: barato demais R$ 9,90 · pechincha R$ 19,90 · começa a ficar caro R$ 44,90 · caro demais R$ 70.

O Premium a R$ 59,90 (o preço atual no código antigo) fica **acima** da faixa. R$ 49,90 fica no limite de cima; R$ 29,90 fica no meio.

## 2. O que os concorrentes cobram
Ver `competitors.md`. Os apps de vet a domicílio ganham por comissão ou por contato, não por mensalidade fixa, então a comparação direta é fraca: o que o vet compara de verdade é "R$ X por mês contra o valor de uma consulta". Os próprios vets do painel repetem: **uma visita paga a mensalidade**.

## 3. O que o negócio precisa (ferramenta do CFO, imposto de 15,5% recalculado em cada preço, Firebase grátis e PIX direto)
| preço | sobra por vet/mês | vets para empatar | ano 1 |
| ---: | ---: | ---: | ---: |
| R$ 29,90 | R$ 25,27 | 27 | -R$ 6.692 |
| R$ 39,90 | R$ 33,72 | 20 | -R$ 6.227 |
| R$ 49,90 | R$ 42,17 | 16 | -R$ 5.763 |

O preço mexe pouco no ano 1, porque quase não há vets pagando no começo. **O preço não é a alavanca; a demanda é.**

## 4. Decisão
- **Free**: R$ 0, para sempre. É o que enche o mapa de vets, e o mapa cheio é o que o tutor precisa ver.
- **Essencial**: R$ 29,90. Hoje vende "sem anúncios" e relatórios, que nenhum vet do painel citou como motivo para pagar. Manter, mas não empurrar.
- **Premium**: **R$ 49,90** (já atualizado no padrão do app; o admin pode ter outro valor salvo em `config/plans`).
- **Oferta de lançamento**: **Vet Fundador** (ver offer.md): grátis até 3 atendimentos pagos pelo app, depois **R$ 29,90 travado por 12 meses**, 30 vagas. A data de fim é real: as vagas acabam ou o lançamento termina em 13/12/2026, o que vier primeiro. Não treina o vet a esperar desconto, porque o preço normal é cobrado de quem entrar depois.
- Nada de "de R$ 59,90 por R$ 29,90" como âncora: o preço que vale daqui para frente é R$ 49,90.

## 5. O que testar com vets reais
Nas visitas de novembro, oferecer metade dos vets a R$ 29,90 travado e a outra metade a R$ 39,90 travado, sempre depois das 3 visitas. Medir quantos aceitam e, em janeiro, quantos continuam pagando.

## 6. As três objeções de preço (para o marketing responder)
1. "Mais uma mensalidade pra pagar sem garantia de que vai entrar consulta." (P010, pitch original)
2. "Pagar R$ 59,90 pra ficar no topo de uma busca que quase ninguém usa não faz sentido; aparecer em primeiro numa lista vazia não me traz atendimento." (P001, pitch original)
3. "Não sei se o topo da busca vai me trazer cliente a mais do que o plano grátis já traria, ainda mais se os outros vets fundadores também estiverem no topo." (P010, Vet Fundador)

_Respostas de compradores simulados: escolhem o que testar, não provam nada._
