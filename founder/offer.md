# A oferta: "Vet Fundador"

Montada na sessão anterior; o reteste foi refeito aqui, com veterinários de Santiago (RS).

## Problemas do vet (na voz dele, vindos dos dois painéis)
Antes de assinar: "app novo sem cliente não serve pra nada"; "mais uma mensalidade"; "aqui todo mundo me acha pelo WhatsApp"; "produtor não pede vet por app"; "o CRMV pode implicar com anúncio pago"; "não quero ser comparado por nota e preço com colega".
Durante: "não tenho tempo pra mexer em mais um app"; "pedido tem que chegar como notificação simples"; "só gente perguntando preço no chat".
Depois: "e se o cliente marca e não aparece ou não paga?"; "como sei que o Premium me trouxe algo a mais que o Free?".

## O pacote
- **Núcleo**: pedidos de atendimento de clientes novos de Santiago, com local no mapa, sem comissão.
- **Garantia embutida**: Premium grátis até o vet fechar 3 atendimentos pagos vindos do app. Ele só paga depois que o app já se pagou.
- **Preço travado**: R$ 29,90/mês por 12 meses (preço normal do Premium: R$ 49,90). Cancela sem multa.
- **Escassez real**: 30 vagas para Santiago e região. O limite é verdadeiro e serve para não lotar o topo da busca.
- **Transparência**: o destaque aparece marcado como "Patrocinado" (ver o risco do CFMV e do CDC em ops.md).

## Escores da equação de valor (1 a 10, antes → depois)
| elemento | antes (selo + relatório, R$ 59,90) | depois (Vet Fundador) | o que move |
| --- | ---: | ---: | --- |
| Resultado sonhado (cliente novo) | 3 | 5 | vender pedido de cliente, não selo |
| Probabilidade percebida | 2 | 3 | só paga após 3 visitas; continua baixa enquanto o app não tem clientes |
| Tempo até o resultado | 3 | 3 | depende da demanda, não da oferta |
| Esforço e sacrifício | 5 | 7 | zero custo inicial, cancela quando quiser |

## Reteste com os mesmos 20 vets simulados de Santiago (seed 7, mesmas cartas)
| pitch | compram | taxa |
| --- | ---: | ---: |
| v1: planos Free / Essencial R$ 29,90 / Premium R$ 59,90 com selo de Destaque (`panel-v1/`) | 0 de 20 | 0% |
| v2: oferta Vet Fundador (`panel/`) | **4 de 20** | **20%** |

Mesmos vets, mesma semente: a diferença é só a oferta. As objeções que caíram: "pagar para ficar no topo de uma lista vazia" (o vet só paga depois de 3 atendimentos) e "mais uma mensalidade sem garantia" (a garantia está embutida). As que ficaram: falta de clientes no app, hábito do WhatsApp e agenda cheia dos vets de gado. Nenhuma oferta para o vet resolve essas três.

- Compram: donos de clínica pequena ou vets mistos (3 de 5) e quem "precisa de cliente novo" (2 de 4). Todos com horário livre.
- Não compram: vets de grandes animais estabelecidos (0 de 6), com agenda cheia pelo WhatsApp, e o vet de agropecuária (0 de 2).
- Por que recusam: falta de necessidade (8), desconfiança de que o app traga clientes (5), hábito do WhatsApp (3). **Ninguém recusou por preço.**
- O que faria mudar de ideia: ver pedidos reais chegando antes de pagar (quase todos), sinal ou pagamento antecipado contra visita perdida (3), confirmação do CRMV-RS sobre o destaque pago (1), nada de ranking público de preço (1), pedido como notificação simples (1).

**Conclusão**: a oferta ajudou, mas o gargalo é o mesmo de antes: demanda. Nenhum ajuste de oferta para o vet resolve isso. O próximo passo é provar que tutores e produtores pedem atendimento (ver launch.md).

## Um furo que o reteste mostrou
Se os 30 Fundadores ficarem todos no Premium, "topo da busca" deixa de significar alguma coisa (objeção do P010). Antes de passar de uns 10 vets ativos na cidade, decidir uma de duas: **(a)** o Fundador recebe pedidos, e o "Patrocinado" vira só um extra pequeno; ou **(b)** limitar a 3 patrocinados por bairro ou raio, em rodízio. A recomendação é **(a)**: vender atendimento, não posição (é o que o conselho pediu).

## Dois acréscimos que o painel pediu e cabem no custo
1. **Sinal pelo app** (ex.: o cliente paga R$ 30 de sinal via PIX ao confirmar, descontado da consulta). Ataca a visita perdida, que é o medo do vet de gado. Custo: integração com o gateway e taxa por PIX. Testar depois que houver pedidos.
2. **Pedido chega pelo WhatsApp do vet** (notificação com link). Ataca "não tenho tempo pra mais um app".
