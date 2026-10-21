# AVANTE · comece aqui

**Veredito: ainda não.** O app só vira negócio se tutores de Santiago pedirem atendimento por ele. Novembro é o teste que prova isso, gastando no máximo R$ 500 e sem abrir empresa antes.

**A oferta para o vet, em uma frase:** *"Premium grátis até você fechar 3 atendimentos pagos pelo app; depois R$ 29,90 por mês, travado por 12 meses. Sem comissão. 30 vagas."*

**Para quem divulgar:** tutores de cães e gatos na cidade. O campo fica para depois.

## O que fazer, em ordem

- [ ] **Publicar o app novo** (o que está no ar ainda é o antigo). No PowerShell, na pasta `avanteapp-web`:
  `npm install` · `npm run build` · `firebase deploy --only firestore:rules,hosting`
- [ ] **Virar admin**: abra `/admin`, copie o seu uid e, no console do Firestore, crie a coleção `admins` com um documento de ID igual ao uid.
- [ ] **Na aba Vets do admin**: veja quem ativou o Premium pelo cupom BEMVINDO e decida se mantém.
- [ ] **Testar com duas contas suas**: o vet pede o Vet Fundador, você ativa, o cliente faz um pedido, o vet finaliza e marca "Recebi o pagamento", o cliente confirma. O painel do vet tem que mostrar "1 de 3".
- [ ] **Até 01/11**: lista de vets de Santiago (consulta de inscritos do CRMV-RS, clínicas, curso de Veterinária da URI).
- [ ] **02 a 06/11**: visitar 15 vets e fechar os 10 primeiros Vets Fundadores. Cadastre cada um na hora, com foto e raio de atendimento.
- [ ] **05 a 13/11**: cartazes com QR code em 4 pet shops e 2 agropecuárias; pauta para a rádio local; posts da lista de espera.
- [ ] **14/11 (sábado)**: 5 tutores conhecidos fazem pedidos de verdade. Acompanhe cada um e anote onde travam.
- [ ] **16/11 (segunda)**: abertura em Santiago. Anúncio na Meta a R$ 10 por dia.
- [ ] **Todo pedido novo**: avise o vet pelo WhatsApp em até 1 hora (sem o Blaze, o app não avisa o vet quando está fechado).
- [ ] **Revisões**: 23/11, 30/11 e **decisão em 13/12**.

## Toda sexta, olhe 3 números

| número | meta | se ficar abaixo |
| --- | --- | --- |
| Pedidos de tutores na semana | 8 ou mais | menos de 3: troque o anúncio |
| Pedidos aceitos por um vet em até 2h | 70% | menos de 50%: falta vet ou aviso |
| Atendimentos realizados e pagos | 3 ou mais na semana 3 | é o número que decide tudo |

## A decisão de 13/12

- **Passou** (10 vets ativos, 30 pedidos, 12 atendimentos pagos): abrir o CNPJ, começar a cobrar os Fundadores que bateram 3 atendimentos (por PIX, registrando na aba Vets) e baixar a divulgação para R$ 200 por mês.
- **Não passou**: não abrir empresa e não gastar mais. Rever a proposta para o tutor antes de tentar de novo.

## Os números, se alguém perguntar

Cada vet pagante deixa R$ 25,27 por mês. O equilíbrio é **27 vets pagando**. O primeiro ano fecha em cerca de **-R$ 6.700**, ou **-R$ 3.100** com a divulgação a R$ 200 por mês depois do lançamento. Uma cidade só não sustenta o negócio: Santiago é o teste.

## Onde está o resto (só se precisar)

| pasta ou arquivo | para quê |
| --- | --- |
| `manual/` | o passo a passo detalhado: `lancamento.md` (datas), `marketing.md` (anúncios e textos), `operacao.md` (rotina, publicar, riscos), `marca.md` (nome e cores) |
| `analise/` | por que decidimos assim: conselho, concorrentes, preço, oferta e financeiro |
| `uma-pagina.md` | resumo para mostrar a um sócio ou parceiro |
| `plano-completo.md` | tudo junto num documento só |
| `dados/` | arquivos das ferramentas (painéis simulados, números). Não precisa abrir. |

_Os vets do painel são simulados e os números são projeções; só o teste de novembro confirma. Não é assessoria financeira, jurídica nem fiscal._
