> **Correção de 22/10 (leia antes).** Este plano foi compilado a partir de um código de junho, sem o servidor gratuito que o app real já tem (Cloudflare Workers). Onde ele fala em "aba Vets do admin", "PIX direto na sua conta" ou "ativar à mão", o app real faz sozinho: o vet paga por PIX ou cartão pela AbacatePay (taxa de R$ 0,80 por PIX), e o Vet Fundador ativa, conta os atendimentos e cobra pelo servidor. Com a taxa do PIX, cada vet pagante deixa R$ 24,47 por mês (não R$ 25,27), o equilíbrio vai a 28 vets e o ano 1 a cerca de -R$ 6.736. O passo a passo certo está em `COMECE-AQUI.md` e `manual/operacao.md`.

# AVANTE · Business plan

**Verdict: Not yet**

- ✓ Each vet-mês earns $25.27 before fixed costs (85% contribution).
- ✗ Year 1 operating LOSS: $6,692.
- ✓ Break-even is 27 vet-mêss a day against a capacity of 30.
- ✗ 4 of 20 simulated buyers buy (20%, the bar is 25%).

| key number | |
| --- | ---: |
| Price | $29.90 a vet-mês |
| Profit margin at plan | -141% per vet-mês |
| Break-even | 27 vet-mêss a day |
| Year 1 operating profit | $-6,692 |
| Startup spend | $1,100 |
| Cash needed before it pays for itself | $7,792 |
| Startup money earned back | not in year 1 |
| Buyer panel | 4 buy · 16 pass |

_Valores em reais (a ferramenta imprime "$"). Unidade: 1 vet pagante por 1 mês; onde está "a day", leia "por mês". Firebase no plano gratuito (sem Blaze), mensalidade por PIX direto. Painel: oferta Vet Fundador; os mesmos 20 vets deram 0 de 20 com os planos antigos (painel-planos-antigos/)._

## The idea

- What it is: app (web, avante-pro.web.app) que conecta tutores de pets e produtores rurais a médicos-veterinários que atendem a domicílio e na propriedade: busca por proximidade e especialidade, agendamento em etapas, chat, avaliações e um assistente de triagem com IA.
- Who it is for: dois lados. Quem paga é o veterinário autônomo (assinatura mensal). Quem usa de graça é o tutor ou o produtor rural que precisa de atendimento sem levar o animal à clínica.
- What it sells, at what price: planos para o vet. Free (R$ 0), Essencial (R$ 29,90/mês), Premium (R$ 49,90/mês desde esta revisão; era R$ 59,90). Sem comissão sobre a consulta: o vet combina e recebe o valor direto do cliente.
- Where and how: lançamento em **Santiago (RS)** e região (Fronteira Oeste / região central). Santiago tem 48.938 habitantes (Censo 2022), 173.836 bovinos, 61.314 ovinos e 4.973 equinos (IBGE, PPM 2025). Pagamento das assinaturas via AbacatePay (PIX), ainda "em breve" no app.
- Budget and constraints: R$ 500/mês para divulgação. O fundador ainda não tem CNPJ nem contador. App já construído (React + Firebase), operado pelo fundador.

Nota: os 11 passos foram rodados de novo nesta pasta, já com Santiago como praça. Uma rodada anterior, no computador do fundador e sem praça definida, tinha dado 0 de 20 vets e nota 4,3 no conselho.

## Summary

**Veredito: ainda não (Not yet).** Duas verificações falham: o ano 1 dá prejuízo (-R$ 6.692) e só 20% dos vets simulados compram (a régua é 25%). O que precisa mudar não é preço nem oferta: é **provar que tutores pedem atendimento pelo app**, com o teste de novembro de lancamento.md.

**O negócio.** O AVANTE leva um veterinário registrado no CRMV até a casa do tutor (e, numa fase 2, até a propriedade rural). O vet paga uma mensalidade sem comissão e o cliente usa de graça. A cidade de lançamento é Santiago (RS): 49 mil habitantes, 174 mil bovinos.

**Os três números.**
- Cada vet pagante deixa R$ 25,27/mês a R$ 29,90 (preço travado do Vet Fundador), com o Firebase no plano gratuito e a mensalidade por PIX direto.
- O equilíbrio é 27 vets pagando, contra um teto de 30 vagas de Fundador. Com o Premium normal a R$ 49,90, cai para 16.
- O ano 1 pede R$ 7.792 de caixa. Com a divulgação a R$ 200/mês depois do lançamento, o prejuízo cai para R$ 3.092.

**O que as evidências dizem.**
- **Conselho**: 3 FUND IF, nota 4,3. Os três concordam que o risco é o marketplace vazio e o cliente fugindo para o WhatsApp, e que o selo pago podia esbarrar no CFMV.
- **Painel** (mesmos 20 vets nos dois pitches): planos antigos 0 de 20; Vet Fundador **4 de 20**. Ninguém recusa por preço; recusam por falta de cliente no app. Os vets de gado estabelecidos recusam os dois (0 de 6).
- **Concorrência**: nenhum app atende Santiago (pet ou campo). Os de fora cobram cerca de 25% ou por lead, e a queixa nº 1 contra eles é pagar por contato que não vira atendimento. Em Santiago, o concorrente é relação: agropecuárias, Sindicato Rural, Senar e WhatsApp.
- **Preço**: faixa aceitável de R$ 10 a R$ 50. O Premium foi de R$ 59,90 para R$ 49,90.

**Onde discordam.** A lente Ofertas queria o campo primeiro; o painel mostra que os vets de gado não têm tempo nem interesse, então o produtor que pedisse pelo app ficaria sem resposta. **Fase 1: pets na cidade.** O campo entra na fase 2, pela porta das agropecuárias e do Sindicato, não contra eles.

**O maior risco** é não haver demanda de tutores. A resposta é o teste de 4 semanas com a linha de sucesso escrita antes (10 vets ativos, 30 pedidos, 12 atendimentos pagos até 13/12) e sem abrir empresa antes de passar.

**Já feito no app** (no branch, falta publicar), tudo no plano gratuito do Firebase, sem Blaze: ninguém mais ativa Premium de graça; o vet pede o plano e você ativa na aba Vets do /admin depois do PIX; selo "Patrocinado"; triagem por IA neutra; contagem de atendimentos pagos e o progresso do Vet Fundador no painel do vet. O preço do plano grátis: cobrança manual e nenhum aviso de pedido com o app fechado.

**Para começar o fundador precisa de** R$ 500 em novembro, 10 a 12 horas por semana e, só se o teste passar, cerca de R$ 1.100 de abertura mais o contador.

**A coisa a fazer esta semana**: publicar as regras e o app no Firebase, no plano gratuito (comandos em operacao.md), virar admin e montar a lista de vets de Santiago (CRMV-RS, clínicas, URI) para as visitas a partir de 02/11.

_O painel é de compradores simulados e os números são projeções; clientes reais e orçamentos reais confirmam. Não é assessoria financeira, jurídica nem fiscal._

## What the board said

**Voto: 3 FUND IF · nota média 4,3/10** (Ofertas 4, Monopólio 4, Produto 5). Memos completos em `conselho/`.

### Riscos que mais de um membro levantou (primeiro)
1. **Marketplace vazio.** Sem tutores e produtores pedindo atendimento, a assinatura não tem o que vender, e o primeiro uso do cliente volta vazio (Ofertas, Monopólio, Produto).
2. **O cliente vaza para o WhatsApp.** Pagamento direto e sem comissão: depois do 1º atendimento o cliente chama o vet direto. O app não é 10 vezes melhor que o WhatsApp mais o boca a boca em nada essencial (Ofertas, Monopólio, Produto).
3. **O selo pago pode esbarrar no CFMV.** "Selo dourado de Destaque" comprado pode ser lido como "distinção que não obteve" (Res. 1.649/2025, Anexo, VII) e tira a confiança do tutor na busca (os três membros).
4. **Mercado e distribuição não medidos.** Ninguém sabe quantos vets atendem fora da clínica em Santiago nem quanto custa trazer um usuário (Ofertas, Monopólio).
5. **Foco.** Pet urbano e rebanho rural são dois produtos (Produto; Ofertas pergunta qual vem primeiro).

### Onde os membros discordam
- **Rural ou pet primeiro?** A lente Ofertas manda testar o **rural** primeiro (há dor e dinheiro: 174 mil bovinos), e vira PASS se não converter. A lente Produto só exige escolher **um**. A lente Monopólio vê o nicho rural como o mercado pequeno a dominar. O painel de vets (consumer) aponta para **pets na cidade**: os vets de gado estabelecidos não compram (0 de 6 nos dois pitches), já quem tem horário livre na cidade compra. Ver marketing.md para a decisão e o porquê.
- **Selo pago.** A lente Produto quer trocar o selo pago por critérios conquistados (verificado, tempo de resposta). As outras duas aceitam o pago desde que liberado por parecer. O app agora marca como "Patrocinado"; o parecer ainda falta.

### Condições (checklist para o resto do pack)
- [x] Escolher uma cidade: Santiago (RS).
- [ ] Escolher **um** público e cortar do lançamento o que não serve a ele; pitch em uma frase (marketing.md).
- [ ] Contar os vets que atendem fora da clínica em Santiago e definir a meta de ativos antes de gastar com divulgação (lancamento.md).
- [ ] Prova de demanda: solicitações reais por vet em 60 a 90 dias (lancamento.md).
- [ ] Oferta vendendo atendimento, não selo, com garantia (oferta.md: Vet Fundador só paga depois de 3 atendimentos pagos).
- [x] Selo "Destaque" trocado por "Patrocinado" e a triagem por IA não favorece mais quem paga (feito no app).
- [ ] Parecer do CRMV-RS ou de advogado sobre o destaque pago **antes de vender o Premium** (operacao.md).
- [ ] CNPJ e cobrança ativos **antes de cobrar**, não necessariamente antes do teste (ponto de atrito: Ofertas pede antes de pagar divulgação; ver lancamento.md).
- [ ] Um motivo para voltar ao app em vez do WhatsApp: histórico do animal ou do rebanho, lembrete de vacina e retorno (Monopólio, Produto).
- [ ] Medir o custo para trazer cada usuário com os R$ 500 antes de abrir outra cidade.
- [ ] Observar 5 tutores e 5 vets reais no primeiro uso.

### A versão mais forte que o conselho enxerga
Não é "um marketplace de vets com planos". É **o caderno de saúde do animal que chama o vet**: em Santiago, o tutor (e depois o produtor) usa o app para registrar vacinas, histórico e lembretes, e quando precisa de atendimento em casa, chama de lá um vet registrado no CRMV. Isso dá um motivo para voltar ao app que o WhatsApp não dá, e torna o efeito de rede local possível. O vet paga porque recebe **atendimentos**, não posição. É diferente do que foi pitchado: menos "busca com destaque pago", mais "registro e rotina com atendimento a um toque".

## The competition

Pesquisa feita em 21/10/2026, só com fontes públicas. Dados completos em `concorrentes.csv`. O comprador que paga é o **veterinário**. Tutores e produtores usam o app de graça.

### 1. Quem está lá (do mais direto ao menos direto)

| # | Nome | Tipo | Onde | Preço (o que o vet paga) | Nota |
|---|---|---|---|---|---|
| 1 | [Vets](https://www.vets.com.br/) | Direto | SP, RJ, DF, PR, MG | "taxa de serviço", valor não divulgado | [4,6 (183)](https://apps.apple.com/br/app/vets-veterin%C3%A1rio-em-domic%C3%ADlio/id1464756913) |
| 2 | [buddy.vet](https://panoramapetvet.com.br/?p=2803) | Direto | RJ, SP (2023); site fora do ar | cerca de 25% por consulta (vet fica com 75%) | n/d |
| 3 | [Vet's Go!](https://blogs.correiobraziliense.com.br/maisbichos/veterinarios-um-clique-de-distancia/) | Direto | DF (2017); status atual não verificado | não divulgado | n/d |
| 4 | [ZapVet](https://zapvet.com.br/) | Direto (serviço próprio) | cidades não informadas | n/a | n/d |
| 5 | [GetNinjas](https://www.getninjas.com.br/familia/servicos-para-pets/veterinario/sp) | Indireto | nacional; **sem página de Santiago** | por lead: pacote a partir de R$ 149,90 (dado de 2022) | [4,2 (17 mil)](https://apps.apple.com/br/app/getninjas-para-profissional/id969564418) |
| 6 | [Petlove](https://www.petlove.com.br/dicas/petlove-testa-servico-match-entre-pais-pets-medicos-veterinarios-atendem-domicilio) | Indireto | piloto em SP; plano de saúde | tutor: R$ 14,90 a R$ 414,90/mês (SP) | n/d |
| 7 | [Hospital Vet. São Francisco](https://www.facebook.com/vet.clinicasaofrancisco/) | Clínica local | R. Getúlio Vargas, 1142 | não divulgado | n/d |
| 8 | [Centro Vet. URI](https://npexpresso.com.br/santiago/uri-amplia-centro-veterinario-e-reforca-atendimentos) | Clínica-escola local | Santiago | não divulgado | n/d |
| 9 | [Clínica L. A. Jornada Martins](https://www.listamais.com.br/categoria/XX0f-1103/clinicas-veterinarias-em-santiago-rs) | Clínica local | Av. Júlio Castilhos, 543 | não divulgado | n/d |
| 10 | [Veterinária Saúde Animal](https://guiacidade.com.br/santiago-rs/empresa/veterinaria-saude-animal-15151069) | Local | R. Pinheiro Machado, 1146 | não divulgado | n/d |
| 11 | [Raça Produção Animal](https://www.apontador.com.br/local/rs/santiago/produtos_veterinarios/X42ZV7G8/raca_producao_animal.html) | Loja vet. local | R. Getúlio Vargas, 1723 | não divulgado | 0 avaliações |
| 12 | [Colpo Agropecuária](https://www.lojalocal.com/pets/02616699000144) | Canal (agropecuária) | R. Bento Gonçalves, 2000 | não divulgado | 1 avaliação |
| 13 | [Sindicato Rural de Santiago](https://www.sinsantiago.com.br/sobre/) | Substituto | Santiago, Unistalda, Capão do Cipó | cursos [Senar gratuitos](https://npexpresso.com.br/geral/sindicato-rural-de-santiago-e-regiao-a-era-do-dialogo-e-das-parcerias) | n/d |
| 14 | [Senar-RS ATeG](https://www.agrolink.com.br/noticias/rs--um-ano-depois--integrantes-da-ateg-ja-colhem-os-resultados_449781.html) | Substituto | RS; [inclui corte e ovinos](https://cnabrasil.org.br/noticias/em-live-senar-rs-apresenta-resultados-do-primeiro-ano-de-ateg) | grátis para o produtor | n/d |
| 15 | [Emater/RS-Ascar](https://www.ufrgs.br/morrodeosorio/emater-rs/) | Substituto | escritório de Santiago não verificado | público | n/d |
| 16 | WhatsApp e boca a boca | Substituto | sem fonte pública (hipótese) | grátis | n/d |

**Não encontrado:** nenhum app brasileiro para produtor rural agendar veterinário na propriedade. Também não há página do GetNinjas para Santiago ([erro 404](https://www.getninjas.com.br/familia/servicos-para-pets/veterinario/rs/santiago)).

### 2. Faixa de preço

**Não dá para comparar em reais.** Cada um cobra o vet de um jeito: comissão de cerca de 25% (buddy.vet), taxa por atendimento sem valor público (Vets) ou compra de leads com valor variável (GetNinjas, de R$ 149,90 a R$ 599,00 por pacote, [Tecnoblog, imagens de 2022](https://tecnoblog.net/responde/como-funciona-o-getninjas/)). A AVANTE é a única com valor fixo publicado: R$ 0, R$ 29,90 ou R$ 49,90 por mês (o Premium era R$ 59,90 até esta revisão). Os substitutos locais custam zero para o vet.

### 3. Mapa de posicionamento (do ponto de vista do vet)

Eixo X: como o vet paga pelo cliente (**por atendimento ou lead** ← → **fixo ou zero**).
Eixo Y: presença em Santiago e no campo (**nenhuma** ↓ ↑ **forte**).

```
              Forte em Santiago / campo
                        |
  (vazio)               |  Agropecuárias, Sindicato, ATeG,
                        |  clínicas locais, boca a boca
                        |  >> AVANTE quer estar aqui <<
 Por atendimento -------+------- Fixo / zero
  buddy.vet (25%)       |
  Vets (taxa)           |  Vet's Go! (?)
  GetNinjas (lead)      |
                        |
               Ausente em Santiago
```

O quadrante de cima à direita já está ocupado por **relações, não por apps**. A AVANTE disputa com hábitos gratuitos, não com outra plataforma.

### 4. Reclamações (ranqueadas)

1. **Pagar por contato que não vira atendimento** (GetNinjas, 5 relatos; não é específico de vets). No Reclame Aqui: ["Cobrança indevida por contatos desatualizados e falta de reembolso"](https://www.reclameaqui.com.br/getninjas/cobranca-indevida-por-contatos-desatualizados-e-falta-de-reembolso_bcVYyz20uPtKhPF4/), ["meus pedidos de devolução de moedas não estão sendo atendidos"](https://www.reclameaqui.com.br/getninjas/meus-pedidos-de-devolucao-de-moedas-nao-estao-sendo-atendidos_hvl-6LXizv_Y8Hm2/), [outra](https://www.reclameaqui.com.br/getninjas/plataforma-pessima-nao-presta-um-bom-atendimento-so-dificulta-a-conversa-pra-voce-desistir-de-tentar-o-reembolso_aJNYqtuJS6aLE2ad/) e [mais uma](https://www.reclameaqui.com.br/getninjas/reembolso-de-moedas_At5xAbpdtapg5pQj/). Na App Store: "Os clientes por parte não tem nenhum compromisso quando solicitam um orçamento" ([link](https://apps.apple.com/br/app/getninjas-para-profissional/id969564418)).
2. **Assinatura difícil de cancelar** (Doctoralia, um **análogo** para médicos que não atende vets). "Não consigo cancelar" é a categoria de queixa mais comum no [Reclame Aqui](https://www.reclameaqui.com.br/empresa/doctoralia/), segundo resumo de busca (a página bloqueou a leitura direta).
3. **Suporte inacessível e cancelamento sem reembolso** (Vets, 2 avaliações, *fino*): "Não consigo meio algum de entrar em contato com o suporte" ([App Store](https://apps.apple.com/br/app/vets-veterin%C3%A1rio-em-domic%C3%ADlio/id1464756913)).
4. **O perfil do vet não aparece e os mesmos vets sempre aparecem** (Vets, 1 avaliação, *fino*; mesmo link). É exatamente o que o "topo da busca" do Premium pode provocar numa cidade com poucos vets.

Os apps de vet em domicílio têm poucas avaliações públicas. Os temas 3 e 4 são fracos.

### 5. A lacuna

**Existe, mas é estreita e ainda sem demanda comprovada.** Nenhuma plataforma encontrada atende Santiago, nem atende grandes animais ou visitas a propriedades. Todas cobram o vet por atendimento ou por lead, e essa é justamente a queixa nº 1. A AVANTE pode ser **o único canal digital em Santiago onde o produtor rural acha um vet que vai ao campo, com custo fixo baixo e sem comissão para o vet**.

O que a pesquisa não prova: que o produtor quer um app. Hoje ele é atendido de graça pela ATeG e pelo Sindicato e compra insumos na agropecuária, que é onde a indicação acontece. A lacuna só se fecha se a AVANTE entrar **por esses canais**, e não contra eles.

### 6. A ameaça (quem copia mais rápido)

1. **Agropecuárias e Sindicato Rural**: uma lista de vets no WhatsApp custa zero, eles já têm a confiança do produtor e recebem o produtor toda semana. Copiam em um dia.
2. **Os próprios vets**, com WhatsApp Business e Instagram: grátis, sem intermediário.
3. **GetNinjas**: já tem a categoria Veterinários no país todo. Uma página de Santiago aparece assim que surgir demanda.
4. **Vets.com.br**: tem o produto pronto para pets e não tem RS nem grandes animais. Copiaria a parte pet, não a rural.

A URI forma vets em Santiago ([fonte](https://npexpresso.com.br/santiago/uri-amplia-centro-veterinario-e-reforca-atendimentos)). Os recém-formados são aliados prováveis do lado da oferta.

## The buyer panel

**4 buy · 16 pass** (20% buy) out of 20 simulated buyers. Seed 7, so the same cards can be dealt again.

These are simulated buyers, not customers. Use this to find objections and weak spots, then confirm the big ones with real people before you spend.

### By segment

| group | buyers | buy rate |
| --- | ---: | ---: |
| Dono de clínica pequena ou vet misto em Santiago (pets na cidade e algum atendimento a campo) | 5 | 60%  (thin) |
| Recém-formado autônomo (até 3 anos de formado), ainda montando carteira | 7 | 14%  (thin) |
| Vet de grandes animais estabelecido (bovinos, ovinos, reprodução, sanidade), atende fazendas da região | 6 | 0%  (thin) |
| Vet empregado em agropecuária ou cooperativa que faz atendimentos por fora | 2 | 0%  (thin) |

### By buying behaviour

| group | buyers | buy rate |
| --- | ---: | ---: |
| Testa ferramentas novas | 2 | 100%  (thin) |
| Precisa de cliente novo | 4 | 50%  (thin) |
| Desconfiado de tecnologia | 3 | 0%  (thin) |
| Vive do boca a boca e do WhatsApp | 5 | 0%  (thin) |
| Agenda cheia na temporada | 3 | 0%  (thin) |
| Calcula custo-benefício de tudo | 3 | 0%  (thin) |

### By income

| group | buyers | buy rate |
| --- | ---: | ---: |
| $60,000 to $111,000 | 7 | 29%  (thin) |
| under $60,000 | 6 | 17%  (thin) |
| $111,000 and up | 7 | 14%  (thin) |

### Why they pass

| reason | buyers | in their words |
| --- | ---: | --- |
| need | 8 | "Minha agenda já está cheia com os produtores que me conhecem há anos e me chamam no WhatsApp. Produtor rural daqui não vai procurar veterinário de gado em app, e com quase nenhum cliente cadastrado não vejo por que pagar pra aparecer no topo de uma busca que ninguém faz." (P003) · "Minha agenda já está cheia com os produtores que me chamam por indicação no WhatsApp, e passo a semana na estrada. Até posso criar o perfil grátis para ver se aparece alguma coisa, mas pagar mensalidade para ficar no topo de um app que ainda quase não tem cliente não faz sentido para mim." (P005) |
| trust | 5 | "Eu crio o perfil grátis porque não custa nada, mas não conto em pagar mensalidade de app que ainda não tem cliente. Meus atendimentos vêm do boca a boca e do grupo de WhatsApp dos produtores, e não vejo produtor daqui pedindo vet por aplicativo tão cedo." (P001) · "Eu faço visita por fora do meu emprego e na temporada não tenho tempo nem pra responder mensagem; o plano Free já me dá perfil, pedidos e chat, então não vejo por que pagar pra aparecer como 'Patrocinado' num app que ainda tem poucos clientes. Crio a conta grátis e vejo se chega pedido." (P007) |
| habit | 3 | "Aqui em Santiago o pessoal me acha pelo WhatsApp e pela indicação da agropecuária, e o app ainda quase não tem cliente. Até crio o perfil grátis, mas não conto em pagar mensalidade por um app que não sei se vai me trazer atendimento." (P004) · "Aqui em Santiago meus clientes me acham pelo WhatsApp e pela indicação do vizinho, e eu passo a semana na estrada sem tempo de ficar mexendo em app. Até posso deixar o perfil grátis lá, mas pagar mensalidade por um app que ainda quase ninguém usa eu não vou." (P008) |

### Why they buy

| reason | buyers | in their words |
| --- | ---: | --- |
| need | 2 | "Tenho tarde livre e preciso de cliente novo; o boca a boca e o WhatsApp não estão enchendo minha agenda. Como só pago depois de 3 atendimentos que vieram pelo app, ativo, e se ele me trouxer 3 clientes pagos, R$ 29,90 é menos que uma consulta, então continuo." (P006) · "Tenho horário sobrando e preciso de cliente, e só pago depois de 3 atendimentos pagos que vieram do app, então não tenho nada a perder ativando. Se o app me trouxer 3 consultas, R$ 29,90 por mês é menos que uma visita, aí continuo pagando sem problema." (P009) |
| price | 1 | "Eu gosto de testar app novo e aqui não arrisco nada: só pago depois de 3 atendimentos pagos que vieram do app, e R$ 29,90 é menos que um terço de uma visita de fim de semana. Se o app me trouxer 3 clientes que pagaram, sigo pagando sem drama." (P002) |
| convenience | 1 | "Eu gosto de testar app novo e passo a semana na estrada, então ter pedido com o local no mapa e agenda no celular me ajuda de verdade. Só pago depois de 3 atendimentos pagos que vieram pelo app, e R$ 29,90 é menos que uma visita; se chegou até aí, se pagou." (P013) |

### What would flip a no

- Ver pedidos de verdade chegando no app aqui em Santiago, tipo um mês com vários produtores e tutores pedindo atendimento na minha região antes de eu ter que pagar.
- Ver que pedidos de propriedades novas, que eu não atendia, estão chegando de verdade pelo app de forma regular, tipo vários por mês, antes de eu ter que pagar qualquer coisa.
- Ver o app trazendo de fato pedidos de gente que não me conhecia, de propriedade rural da região, nos primeiros meses. Se pingar atendimento novo todo mês, R$ 29,90 se paga com uma visita.
- Ver que o app realmente traz produtores novos de gado e ovelha da região, com algum tipo de garantia contra visita perdida, como um sinal ou pagamento adiantado pelo app.
- Uma confirmação por escrito do CRMV-RS de que o destaque pago no app está dentro do código de ética, e ver que os pedidos estão chegando de verdade em Santiago.
- Ver que os pedidos estão chegando de verdade: se pelo plano grátis aparecerem clientes novos, que não me conheciam, todo mês, aí R$ 29,90 se paga com uma visita e eu assino.
- Ver, depois das 3 visitas, que o Premium me trouxe pelo menos um atendimento a mais por mês do que eu teria no Free; aí a consulta paga a mensalidade e eu continuo.
- Ver que produtores grandes da região realmente estão pedindo atendimento de bovino e ovino pelo app, com chamados que eu não pegaria de outro jeito, e sem ranking de preço público entre os vets.
- Ver o app me trazendo de fato pelo menos um atendimento pago por mês na região, de forma constante; aí os R$ 29,90 se pagam e eu mantenho.
- Ver que o app realmente me mandou pedidos de fazendas novas, que eu não conhecia, de forma constante, todo mês, aí os R$ 29,90 se pagam com uma visita só.
- Ver pedidos reais chegando de produtores e tutores de Santiago que eu ainda não atendo, que paguem a consulta, antes de ter que pagar qualquer coisa.
- Ver pedidos pagos chegando de fato pelo app nos primeiros meses, de gente que não me acharia pelo boca a boca, e o pedido chegar como notificação simples sem eu ter que ficar abrindo o app.

Buyers say they would buy **1.0 times** in the first month on average.

20 buyers gave all four price answers. Run founder-pricing's van_westendorp.py on the answers folder.

## Pricing

### 1. O que os vets disseram
40 respostas de preço (os mesmos 20 vets simulados de Santiago, nos dois pitches; curva em `curva-de-preco.md`):

| ponto | preço/mês | o que significa |
| --- | ---: | --- |
| PMC | R$ 10 | abaixo disso, parece barato demais para ser bom |
| IPP | R$ 25 | tantos acham "pechincha" quanto "caro" |
| PME | **R$ 50** | acima disso, gente demais não compra |

**Faixa aceitável: R$ 10 a R$ 50.** Medianas: barato demais R$ 9,90 · pechincha R$ 19,90 · começa a ficar caro R$ 44,90 · caro demais R$ 70.

O Premium a R$ 59,90 (o preço atual no código antigo) fica **acima** da faixa. R$ 49,90 fica no limite de cima; R$ 29,90 fica no meio.

### 2. O que os concorrentes cobram
Ver `concorrentes.md`. Os apps de vet a domicílio ganham por comissão ou por contato, não por mensalidade fixa, então a comparação direta é fraca: o que o vet compara de verdade é "R$ X por mês contra o valor de uma consulta". Os próprios vets do painel repetem: **uma visita paga a mensalidade**.

### 3. O que o negócio precisa (ferramenta do CFO, imposto de 15,5% recalculado em cada preço, Firebase grátis e PIX direto)
| preço | sobra por vet/mês | vets para empatar | ano 1 |
| ---: | ---: | ---: | ---: |
| R$ 29,90 | R$ 25,27 | 27 | -R$ 6.692 |
| R$ 39,90 | R$ 33,72 | 20 | -R$ 6.227 |
| R$ 49,90 | R$ 42,17 | 16 | -R$ 5.763 |

O preço mexe pouco no ano 1, porque quase não há vets pagando no começo. **O preço não é a alavanca; a demanda é.**

### 4. Decisão
- **Free**: R$ 0, para sempre. É o que enche o mapa de vets, e o mapa cheio é o que o tutor precisa ver.
- **Essencial**: R$ 29,90. Hoje vende "sem anúncios" e relatórios, que nenhum vet do painel citou como motivo para pagar. Manter, mas não empurrar.
- **Premium**: **R$ 49,90** (já atualizado no padrão do app; o admin pode ter outro valor salvo em `config/plans`).
- **Oferta de lançamento**: **Vet Fundador** (ver oferta.md): grátis até 3 atendimentos pagos pelo app, depois **R$ 29,90 travado por 12 meses**, 30 vagas. A data de fim é real: as vagas acabam ou o lançamento termina em 13/12/2026, o que vier primeiro. Não treina o vet a esperar desconto, porque o preço normal é cobrado de quem entrar depois.
- Nada de "de R$ 59,90 por R$ 29,90" como âncora: o preço que vale daqui para frente é R$ 49,90.

### 5. O que testar com vets reais
Nas visitas de novembro, oferecer metade dos vets a R$ 29,90 travado e a outra metade a R$ 39,90 travado, sempre depois das 3 visitas. Medir quantos aceitam e, em janeiro, quantos continuam pagando.

### 6. As três objeções de preço (para o marketing responder)
1. "Mais uma mensalidade pra pagar sem garantia de que vai entrar consulta." (P010, pitch original)
2. "Pagar R$ 59,90 pra ficar no topo de uma busca que quase ninguém usa não faz sentido; aparecer em primeiro numa lista vazia não me traz atendimento." (P001, pitch original)
3. "Não sei se o topo da busca vai me trazer cliente a mais do que o plano grátis já traria, ainda mais se os outros vets fundadores também estiverem no topo." (P010, Vet Fundador)

_Respostas de compradores simulados: escolhem o que testar, não provam nada._

## The offer

Montada na sessão anterior; o reteste foi refeito aqui, com veterinários de Santiago (RS).

### Problemas do vet (na voz dele, vindos dos dois painéis)
Antes de assinar: "app novo sem cliente não serve pra nada"; "mais uma mensalidade"; "aqui todo mundo me acha pelo WhatsApp"; "produtor não pede vet por app"; "o CRMV pode implicar com anúncio pago"; "não quero ser comparado por nota e preço com colega".
Durante: "não tenho tempo pra mexer em mais um app"; "pedido tem que chegar como notificação simples"; "só gente perguntando preço no chat".
Depois: "e se o cliente marca e não aparece ou não paga?"; "como sei que o Premium me trouxe algo a mais que o Free?".

### O pacote
- **Núcleo**: pedidos de atendimento de clientes novos de Santiago, com local no mapa, sem comissão.
- **Garantia embutida**: Premium grátis até o vet fechar 3 atendimentos pagos vindos do app. Ele só paga depois que o app já se pagou.
- **Preço travado**: R$ 29,90/mês por 12 meses (preço normal do Premium: R$ 49,90). Cancela sem multa.
- **Escassez real**: 30 vagas para Santiago e região. O limite é verdadeiro e serve para não lotar o topo da busca.
- **Transparência**: o destaque aparece marcado como "Patrocinado" (ver o risco do CFMV e do CDC em operacao.md).

### Escores da equação de valor (1 a 10, antes → depois)
| elemento | antes (selo + relatório, R$ 59,90) | depois (Vet Fundador) | o que move |
| --- | ---: | ---: | --- |
| Resultado sonhado (cliente novo) | 3 | 5 | vender pedido de cliente, não selo |
| Probabilidade percebida | 2 | 3 | só paga após 3 visitas; continua baixa enquanto o app não tem clientes |
| Tempo até o resultado | 3 | 3 | depende da demanda, não da oferta |
| Esforço e sacrifício | 5 | 7 | zero custo inicial, cancela quando quiser |

### Reteste com os mesmos 20 vets simulados de Santiago (seed 7, mesmas cartas)
| pitch | compram | taxa |
| --- | ---: | ---: |
| v1: planos Free / Essencial R$ 29,90 / Premium R$ 59,90 com selo de Destaque (`painel-planos-antigos/`) | 0 de 20 | 0% |
| v2: oferta Vet Fundador (`painel-vet-fundador/`) | **4 de 20** | **20%** |

Mesmos vets, mesma semente: a diferença é só a oferta. As objeções que caíram: "pagar para ficar no topo de uma lista vazia" (o vet só paga depois de 3 atendimentos) e "mais uma mensalidade sem garantia" (a garantia está embutida). As que ficaram: falta de clientes no app, hábito do WhatsApp e agenda cheia dos vets de gado. Nenhuma oferta para o vet resolve essas três.

- Compram: donos de clínica pequena ou vets mistos (3 de 5) e quem "precisa de cliente novo" (2 de 4). Todos com horário livre.
- Não compram: vets de grandes animais estabelecidos (0 de 6), com agenda cheia pelo WhatsApp, e o vet de agropecuária (0 de 2).
- Por que recusam: falta de necessidade (8), desconfiança de que o app traga clientes (5), hábito do WhatsApp (3). **Ninguém recusou por preço.**
- O que faria mudar de ideia: ver pedidos reais chegando antes de pagar (quase todos), sinal ou pagamento antecipado contra visita perdida (3), confirmação do CRMV-RS sobre o destaque pago (1), nada de ranking público de preço (1), pedido como notificação simples (1).

**Conclusão**: a oferta ajudou, mas o gargalo é o mesmo de antes: demanda. Nenhum ajuste de oferta para o vet resolve isso. O próximo passo é provar que tutores e produtores pedem atendimento (ver lancamento.md).

### Um furo que o reteste mostrou
Se os 30 Fundadores ficarem todos no Premium, "topo da busca" deixa de significar alguma coisa (objeção do P010). Antes de passar de uns 10 vets ativos na cidade, decidir uma de duas: **(a)** o Fundador recebe pedidos, e o "Patrocinado" vira só um extra pequeno; ou **(b)** limitar a 3 patrocinados por bairro ou raio, em rodízio. A recomendação é **(a)**: vender atendimento, não posição (é o que o conselho pediu).

### Dois acréscimos que o painel pediu e cabem no custo
1. **Sinal pelo app** (ex.: o cliente paga R$ 30 de sinal via PIX ao confirmar, descontado da consulta). Ataca a visita perdida, que é o medo do vet de gado. Custo: integração com o gateway e taxa por PIX. Testar depois que houver pedidos.
2. **Pedido chega pelo WhatsApp do vet** (notificação com link). Ataca "não tenho tempo pra mais um app".

## The numbers

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

**O custo escondido do plano grátis**: a cobrança e a ativação são manuais. Para 30 vets, é perto de 1 hora por mês conferindo PIX e tocando em "PIX recebido" no admin. Sem Cloud Functions também não há notificação push quando o app está fechado (o vet só é avisado com o app aberto), o que pesa no concierge por WhatsApp (operacao.md).

**Condições do conselho sobre dinheiro**: não atendidas. O ano 1 não se paga, e a demanda ainda não foi provada. A lente Ofertas pede CNPJ e cobrança antes de pagar divulgação; o plano deixa o CNPJ para depois do teste de novembro porque no teste ninguém paga (o Fundador só paga depois de 3 atendimentos), e assim os R$ 1.100 de abertura só saem se houver demanda. Este relatório já conta contador e imposto desde o mês 1, então é conservador.

Estimativas que precisam de orçamento real (ver financeiro-fontes.md): imposto, contador, Groq, abertura do CNPJ, gráfica e advogado. Não é assessoria contábil nem fiscal: o contador confirma o enquadramento, o CNAE e o pró-labore antes de abrir a empresa.

---

## Unit economics: AVANTE, Santiago RS (unidade = 1 vet pagante por 1 mês; 'a day' no relatório = 'por mês')

Every number below comes from the input file. Nothing is looked up or guessed.

### One vet-mês

| line | per vet-mês |
| --- | ---: |
| Price | $29.90 |
| Imposto Simples Nacional (estimativa conservadora: Anexo V, 15,5%) | -$4.63 |
| PIX recebido direto na conta da empresa (estimativa: grátis no banco digital) | -$0.00 |
| **Contribution** (what each vet-mês leaves to pay the fixed costs) | **$25.27** (85%) |

### The margin that matters

Fixed costs: $674 a month (Divulgação local (definido pelo fundador) $500, Contador online para ME no Simples (estimativa) $150, Firebase no plano gratuito Spark (sem Cloud Functions) $0, API de IA da triagem, Groq (estimativa) $20, Domínio .com.br (R$ 40/ano) $4).

- **Break-even: 27 vet-mêss a day.** Below that you lose money every month.
- **Profit margin at your plan** (10 a day): **-141%** of every sale, after every cost.
- Capacity: 30 a day.

### Year 1, month by month

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

### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | -141% | 27 | -$6,692 |
| Price -10% | -167% | 31 | -$6,857 |
| Volume -20% | -197% | 27 | -$6,970 |
| Unit costs +15% | -143% | 28 | -$6,730 |

### Red flags

- Year 1 loses money on operations (-$6,692).
- The startup spend is not earned back within year 1.

## Marketing

### A escolha que o conselho pediu: começar por pets na cidade
Os dados de Santiago puxam para o campo (174 mil bovinos, 61 mil ovinos), mas o painel mostra que **o vet que pagaria está na cidade**: dono de clínica pequena, vet misto ou recém-formado com horário livre. Os vets de gado estabelecidos (0 de 6) já vivem com agenda cheia pelo WhatsApp, e o produtor já tem "o seu vet". Então:

- **Fase 1 (agora)**: tutores de cães e gatos na área urbana de Santiago. A Resolução CFMV nº 1.690/2026 regulamentou o atendimento domiciliar de pets de pequeno porte em janeiro, o que é notícia e dá segurança ao tutor.
- **Fase 2 (só depois de provar a fase 1)**: produtores, com outro gancho (plantão na temporada de parição e vacinação, quando os vets de gado estão lotados) e o sinal pago pelo app contra visita perdida.

**Divergência registrada**: a lente Ofertas do conselho mandava testar o rural primeiro. O painel, com os mesmos 20 vets nos dois pitches, mostra os 6 vets de gado estabelecidos recusando os dois (agenda cheia, cliente pelo WhatsApp). Sem vet de gado com tempo livre, o produtor que pedir pelo app fica sem resposta, que é o "primeiro uso vazio" que a lente Produto apontou como o risco nº 1. Por isso, pet primeiro.

**O pitch em uma frase** (condição da lente Produto): *"Em Santiago, chame um veterinário registrado no CRMV até a sua casa, pelo celular."*

**O que fica de fora do lançamento** (para o tutor): planos e relatórios não aparecem para ele; a triagem por IA fica como apoio, não como porta de entrada; atendimento rural some do texto de divulgação (continua possível no app).

**O motivo para voltar ao app** (condição das lentes Monopólio e Produto): o app já tem cadastro de animais com registros clínicos. Na divulgação e no pós-atendimento, empurrar o "caderno do pet": vacinas e histórico no celular, com lembrete da próxima dose, e a próxima visita marcada de lá. É o que o WhatsApp não faz.

### Posicionamento
Três versões:
1. Para tutores de Santiago que não conseguem (ou não querem) levar o animal à clínica, o AVANTE é o app que chama um veterinário registrado no CRMV até a sua casa, com local no mapa e conversa antes, sem intermediário cobrando por fora.
2. Para tutores com animal idoso, bravo ou que estressa no carro, o AVANTE leva o veterinário até ele.
3. Para quem precisa de um vet hoje e não sabe quem atende em casa, o AVANTE mostra quem está disponível perto de você agora.

**Recomendada: a 2 no anúncio, a 1 no app e no material impresso.** É a dor mais concreta, cabe num vídeo de 3 segundos e não promete o que o app ainda não entrega (a 3 depende de ter vets online, o que só acontece com mais vets).

Para os vets (recrutamento corpo a corpo, não por anúncio): "Clientes novos de Santiago pedindo atendimento em casa. Sem comissão. Você só paga depois que o app te trouxer 3 atendimentos pagos."

### Canais
| canal | por que serve | custo | como medir |
| --- | --- | ---: | --- |
| **Visita pessoal aos vets** | Cidade pequena: o vet decide olhando no olho. É assim que se fecham os 10 primeiros. | R$ 0 (tempo) | vets ativos no app |
| **Meta Ads (Instagram e Facebook)**, raio de 15 km de Santiago | Onde o tutor urbano rola o feed; dá para segmentar a cidade | R$ 300 | custo por pedido feito no app |
| **Pet shops e agropecuárias da cidade** (cartaz A3 com QR code no balcão) | O tutor já está lá comprando ração | R$ 100 (impressão) | escaneamentos do QR (link com UTM) |
| **Rádio local** (entrevista sobre a nova regra do CFMV e o app local) | Alcança público mais velho e o rural; entrevista é de graça | R$ 0 (spot pago só se a entrevista não sair: R$ 100) | pico de cadastros no dia |
| **Perfil no Google** (Google Business Profile) e grupos de Facebook da cidade | Busca "veterinário em domicílio Santiago" | R$ 0 | visualizações e cliques |
| **URI Santiago** (curso de Medicina Veterinária e Centro Veterinário) | Forma vets na cidade; os recém-formados são quem tem horário livre e compra (painel). Conversa com a coordenação e um cartaz no curso | R$ 0 | vets recém-formados cadastrados |

**Com as agropecuárias e o Sindicato Rural, parceria, não disputa** (concorrentes.md): elas já são onde a indicação de vet acontece e poderiam copiar o AVANTE em um dia com uma lista no WhatsApp. A proposta é o contrário: o cartaz do AVANTE no balcão com o nome da loja ("indicação Colpo Agropecuária", se ela topar), e a loja ganha um jeito de indicar sem se comprometer com um vet só. Isso vale já para pet shops na fase 1 e é a porta de entrada da fase 2 no campo.

**O que não vamos fazer agora**: Google Ads (pouca busca numa cidade de 49 mil), influenciador pago, outdoor, e o produtor rural (fica para a fase 2).

### Os 30 dias (D0 = segunda, 16/11/2026, abertura para tutores)
| data | canal | o que sai |
| --- | --- | --- |
| 02/11 a 06/11 (D-14 a D-10) | visita pessoal | Visitar 15 vets (lista em operacao.md) e cadastrar os 10 primeiros como Vet Fundador. Foto de perfil e raio de atendimento preenchidos na hora. |
| 05/11 (D-11) | pet shops | Pedir espaço no balcão de 4 pet shops e 2 agropecuárias da cidade. |
| 09/11 (D-7) | Instagram orgânico | Post 1: "Santiago vai ter veterinário em casa pelo app. Lista de espera no link." |
| 10/11 (D-6) | rádio | Pauta enviada: a regra nova do CFMV para atendimento em casa e um app daqui. |
| 11/11 (D-5) | pet shops | Cartazes A3 com QR code (link de lista de espera). |
| 12/11 (D-4) | Instagram | Post 2: bastidores, com um vet fundador (com autorização) mostrando a maleta de atendimento domiciliar. |
| 13/11 (D-3) | grupos de Facebook | Aviso da abertura no dia 16 (sem anúncio de preço de consulta). |
| 16/11 (D0) | todos | Abertura: e-mail ou WhatsApp para a lista de espera, anúncio Meta liga (R$ 10/dia), post "abriu". |
| 17/11 a 20/11 | Meta | Anúncio A (gancho 1) contra anúncio B (gancho 2). No dia 20, desligar o pior. |
| 18/11 | rádio | Entrevista (se a pauta for aceita). |
| 19/11 | Instagram | "Como funciona": 3 passos, em vídeo de tela. |
| 23/11 (D+7) | revisão | Ver os números da semana (abaixo). |
| 24/11 a 27/11 | Meta e Instagram | Gancho 3 ou 4 (o animal idoso e o gato que estressa no carro). |
| 26/11 | pet shops | Repor cartaz e perguntar no balcão se alguém comentou. |
| 30/11 (D+14) | revisão | Decidir: manter, mudar o gancho ou parar o anúncio. |
| 01/12 a 02/12 (D+15 a D+16) | Instagram | Post sobre o que se faz em casa e o que precisa de clínica (educativo, sem promessa de resultado). |

Quando não houver novidade: rotina de um vet fundador (com autorização), perguntas frequentes, o que se faz em casa e o que precisa de clínica.

### Dez ganchos
1. "Seu gato odeia caixa de transporte? O veterinário vai até ele." (objeção: deslocamento)
2. "Cachorro idoso, com dificuldade de andar? Atendimento em casa, em Santiago." (dor concreta)
3. "Veterinário registrado no CRMV, na sua casa, marcado pelo celular." (confiança)
4. "Converse com o veterinário antes de marcar." (medo do desconhecido)
5. "Vacina sem estresse: aplicada em casa." (rotina; a Res. 1.690 permite imunização em domicílio)
6. "Você vê no mapa quem atende o seu bairro." (conveniência)
7. "Feito em Santiago, para Santiago." (orgulho local, contra "app de cidade grande")
8. Para vets: "Cliente novo pedindo atendimento em casa. Você só paga depois de 3 atendimentos." (objeção: app sem clientes; e a queixa nº 1 contra os concorrentes, pagar por contato que não vira atendimento)
9. Para vets: "Sem comissão. A consulta é sua." (objeção: mais um intermediário; os apps de fora ficam com cerca de 25% ou cobram taxa)
10. Para vets: "O pedido chega com o endereço no mapa. Você aceita ou recusa." (objeção: falta de tempo)

**Regras**: nada de preço ou tabela de consulta ou procedimento no anúncio (o vet não pode divulgar isso, Res. CFMV 1.649/2025, art. 6º, V); nada de "o melhor veterinário"; os depoimentos do painel são simulados e **nunca** viram depoimento em anúncio; post com vet só com autorização por escrito, e ele responde eticamente pelo que compartilhar (art. 5º).

### Orçamento e números
- **Novembro (R$ 500)**: Meta R$ 300, impressão R$ 100, reserva R$ 100 (spot de rádio ou mais anúncio no que funcionar). A partir de janeiro: **R$ 200/mês** (ver financeiro.md: é o que mais reduz o prejuízo).
- **O máximo para ganhar um vet pagante**: ele deixa R$ 25,27/mês × 12 meses travados = **R$ 303**. Como ele só paga depois de 3 atendimentos e precisa de pelo menos 1 por mês para continuar, o custo de marketing por **atendimento fechado** precisa ficar abaixo de cerca de **R$ 60**.
- **Os três números semanais**:
  1. **Pedidos de tutores por semana**. Meta: 8 ou mais a partir da semana 2. Abaixo de 3, trocar o gancho e o canal.
  2. **Pedidos aceitos por um vet em até 2 horas**. Meta: 70%. Abaixo de 50%, o problema é a oferta de vets (recrutar mais ou ativar o aviso por WhatsApp).
  3. **Atendimentos realizados e pagos por semana**. Meta: 3 ou mais na semana 3. É o número que decide se o negócio existe.

## Brand

O app já está no ar como **AVANTE** (avante-pro.web.app), com verde #375337 e fonte Inter. Este passo verifica se vale manter e fecha o que falta.

### Nome
| candidato | o que diz | risco |
| --- | --- | --- |
| **Avante** (atual) | "vamos em frente"; curto, fácil de falar no rádio | Palavra comum: há muitas marcas "Avante" no INPI e um partido político com esse nome. Fraco sozinho. |
| **Avante Vet** | o mesmo, mais a categoria | Recomendado. `avantevet.com.br` estava livre em 21/10/2026; `avantevet.com` já tem dono. |
| Vet em Casa Santiago | descritivo | Genérico, difícil de registrar, preso à cidade |
| Visita Vet | descritivo | Genérico |
| Porteira | rural, gaúcho | Bom para a fase 2 (campo), estranho para pets |
| Chama o Vet | ação | Coloquial, bom gancho, fraco como marca |
| Querência Vet | regional gaúcho | Forte no RS, prende a marca a uma região |
| Pampa Vet | regional | Provavelmente já usado por clínicas |
| Vetaí | inventado | Fácil de registrar, não diz nada sozinho |
| Bicho em Casa | descritivo, simpático | Informal demais para o vet |

**Recomendação: manter "Avante" e usar "Avante Vet" na comunicação.** Trocar o nome agora custaria mais que ganharia: o app já está no ar e o problema é demanda, não nome.

**Verificações que você mesmo precisa fazer** (só fiz consultas públicas; quem confirma marca é um advogado de propriedade intelectual, e nada fica registrado até você registrar):
- **INPI** (busca.inpi.gov.br): "Avante Vet" e "Avante" nas classes **44** (serviços veterinários), **35** (intermediação e plataforma de negócios), **42** (software como serviço) e **9** (aplicativo).
- **Domínio**: registrar `avantevet.com.br` no registro.br (R$ 40/ano).
- **Redes**: verificar @avantevet no Instagram, no Facebook e no TikTok.
- **Confusão**: nenhum concorrente do levantamento usa nome parecido.

### Promessa, slogan e voz
- **Promessa**: "Um veterinário registrado até o seu animal, sem você sair de casa."
- **Slogan** (três opções): "O veterinário vai até você." · "Cuidado que chega em casa." · "Veterinário em casa, em Santiago." (recomendado para a fase 1)
- **Voz**:
  - **Próxima**: fala como gente da cidade. Faça: "Seu gato odeia caixa de transporte?" Não faça: "Soluções inovadoras em saúde animal."
  - **Clara**: uma ideia por frase. Faça: "Você vê no mapa quem atende o seu bairro." Não faça: frases com três benefícios empilhados.
  - **Responsável**: não promete resultado nem diagnóstico. Faça: "O vet avalia se dá para atender em casa." Não faça: "Resolva tudo sem sair de casa."
- **Antes e depois** (pitch): antes, "Selo dourado de Destaque e topo dos resultados da busca". Depois, "Apareça para quem está pedindo atendimento no seu bairro (marcado como Patrocinado)".

### Visual
- **Cores**: verde floresta **#375337** (marca, botões; texto branco sobre ele tem contraste de 8,55:1, passa no AA e no AAA), verde quase preto **#1C2B1E** (texto; sobre o creme, 12,93:1), creme **#F3EFE4** (fundo de material impresso; verde sobre creme dá 7,45:1) e âmbar **#F59E0B** só para o selo "Patrocinado" e para alertas (sobre o verde-escuro, 6,92:1; **nunca** texto âmbar sobre branco).
- **Fontes**: Inter (já no app, licença livre SIL OFL, pelo Google Fonts). Para títulos de cartaz, opcionalmente Fraunces (também livre, SIL OFL, pelo Google Fonts).
- **Logo**: precisa funcionar como ícone de 32 px, num cartaz A3 de balcão e em preto e branco num panfleto. Deve sugerir movimento ("ir até") e cuidado animal sem pata genérica de clip-art nem cruz de farmácia. Evitar: estetoscópio (clichê) e qualquer coisa que lembre o partido Avante. Se quiser, gero conceitos com uma ferramenta de imagem; seriam conceitos, não o logo final.

### Os cinco primeiros pontos de contato
1. **Cartaz no balcão do pet shop**: slogan, gancho 1, QR code e "veterinários registrados no CRMV".
2. **Tela inicial do app**: "O que está acontecendo com seu pet?" já existe; adicionar "Atendimento em casa em Santiago" logo acima.
3. **Confirmação do pedido**: nome do vet, CRMV, horário, endereço e o que levar ou preparar.
4. **Primeiro post**: "Santiago vai ter veterinário em casa pelo app".
5. **Resposta à primeira reclamação**: pública, curta, sem culpar o vet nem o cliente, levando a conversa para o privado em até 2 horas.

## Operations

### O app no plano gratuito do Firebase (sem Blaze)
Decisão do fundador: **não assinar o Blaze**. O app já foi feito para rodar sem servidor (IA chamada do navegador, notificações locais, nota calculada na tela). O que muda:

| o quê | como fica |
| --- | --- |
| Ativar plano pago ou Vet Fundador | O vet toca em "Quero ser Vet Fundador" ou "Pedir assinatura" (tela de planos). O pedido aparece na aba **Vets** do `/admin`, e você ativa com um toque. |
| Cobrar a mensalidade | Você manda a chave PIX por WhatsApp, recebe e toca em "PIX recebido (+1 mês)" no admin. O admin mostra até quando cada vet está pago. |
| Contar os 3 atendimentos do Fundador | Calculado na tela: atendimento finalizado, com "Recebi o pagamento" marcado pelo vet e confirmado pelo cliente (ou 48h sem resposta). O painel do vet mostra "X de 3"; o admin avisa quando é hora de começar a cobrar. |
| Notificação de pedido novo | Só com o app aberto (notificação local). Com o app fechado, o vet **não** é avisado. Por isso o concierge por WhatsApp (abaixo) é obrigatório no lançamento. |
| Confirmação automática em 24h, limpeza de chats antigos, média de avaliações no perfil | Não rodam (eram Cloud Functions). A nota aparece certa no painel do vet; na busca do cliente pode ficar desatualizada. |

### Bloqueios no app (corrigidos no branch)
1. ✅ **Qualquer vet podia virar Premium de graça** (cupom BEMVINDO validado no navegador e anunciado na tela; regras deixavam o vet gravar o próprio plano). Agora `firestore.rules` só deixa o **admin** gravar plano pago, destaque, Vet Fundador, mensalidade paga e nota. 33 testes no emulador passando.
2. ✅ **A triagem com IA recomendava quem paga, sem avisar.** Agora escolhe por espécie, online e nota.
3. ✅ **O selo dizia "Destaque".** Agora "Patrocinado", e os Termos de Uso explicam que é anúncio pago.
4. ✅ **A regra das 3 visitas não era medida.** Botão "Recebi o pagamento" no atendimento finalizado e contagem na tela.

**Para publicar** (do seu computador, com o Firebase CLI logado no projeto certo: o `.firebaserc` aponta para `avante-pro`, mas o `.env.example` para `avantepro-a1438`; confira com `firebase use` qual é o do app no ar):
```
firebase deploy --only firestore:rules
npm run build && firebase deploy --only hosting
```
Não rode `firebase deploy` sem `--only`: ele tentaria publicar as Cloud Functions, o que exige o Blaze.

**Antes de abrir para os vets:**
- Vire admin: no console do Firestore, crie a coleção `admins` com um documento cujo ID seja o seu uid (a tela `/admin` mostra o uid).
- Revise na aba Vets quem ativou o Premium pelo BEMVINDO antes da correção e decida se mantém.
- **Chave da Groq**: fica só no servidor (`npx wrangler secret put GROQ_API_KEY` na pasta `worker`). Cada conta tem um limite diário de perguntas. Deixe também um limite de gasto no painel da Groq.

Limite conhecido: cliente e vet podem editar a solicitação inteira (regra antiga de `requests`), então um vet com duas contas conseguiria inflar a própria contagem. Para 30 vets que você conhece pessoalmente, o risco é baixo; o admin mostra os números para você conferir.

### O ciclo do dia (o fundador, sozinho)
1. 8h: ver pedidos novos da noite. **(o cliente vê)**
2. Pedido sem resposta de vet em 1 hora: chamar um vet por WhatsApp (modo "concierge" nas primeiras semanas). **(o cliente vê o resultado)**
3. 12h e 18h: repetir o passo 2.
4. Depois de cada atendimento: perguntar ao tutor se correu bem (2 linhas, por WhatsApp). **(o cliente vê)**
5. 20h: anotar na planilha os pedidos, aceites, atendimentos realizados e pagos e os vets ativos.
6. Sexta: rodar a revisão semanal (ver lancamento.md).

### Fornecedores
| item | opções | custo | observação |
| --- | --- | --- | --- |
| Recebimento da mensalidade | PIX direto na conta (PF no teste; conta PJ num banco digital depois do CNPJ) | estimativa R$ 0 | sem Blaze não há checkout automático (AbacatePay e Asaas precisariam de Cloud Functions para ativar o plano sozinhos) |
| Contador | contador de Santiago e 2 contabilidades online | estimativa R$ 150/mês | pedir orçamento já perguntando CNAE, Anexo III ou V, fator R e pró-labore |
| Hospedagem | Firebase no plano gratuito (Spark) | R$ 0 | sem Cloud Functions; ver acima o que muda |
| IA | Groq | estimativa R$ 20/mês | alerta de uso |
| Impressos | gráfica local de Santiago | estimativa R$ 100 a R$ 300 | 10 cartazes A3 e 500 panfletos |
| Anúncios | Meta Ads | R$ 300 em novembro | cartão do fundador até ter CNPJ |

### Pessoas
Só o fundador. Estimativa de **10 a 12 horas por semana** no primeiro mês (visitas aos vets, concierge dos pedidos, conteúdo), caindo para 5 a 6 depois. Sem salário no plano (ver financeiro.md). Pró-labore e INSS: o contador define junto com o enquadramento.

### Rotinas (uma página cada)
**Recrutar um vet (presencial, 15 minutos)**
1. Levar o celular com o app aberto no perfil de um vet fundador já cadastrado.
2. Mostrar o pedido como o vet recebe (mapa, chat).
3. Explicar a oferta: grátis até 3 atendimentos pagos, depois R$ 29,90 travado por 12 meses, sem comissão.
4. Cadastrar na hora: foto, CRMV, raio de atendimento, espécies atendidas.
5. Combinar como ele quer ser avisado (WhatsApp).

**Pedido novo**
1. Conferir se há vet no raio que atende a espécie.
2. Se ninguém aceitar em 1 hora, chamar no WhatsApp até 2 vets.
3. Se ninguém puder, avisar o tutor com honestidade e sugerir a clínica mais próxima.

**Reclamação**
1. Responder em até 2 horas, no privado.
2. Ouvir o vet e o tutor separadamente.
3. Problema de conduta técnica do vet: orientar o tutor a procurar o CRMV-RS (o app não julga ato veterinário).
4. Anotar e revisar na sexta.

**Revisão semanal (sexta)**: os três números de marketing.md, os vets que pararam de responder e o que mudar na semana seguinte.

### Ferramentas
O app (já pronto, com a aba Vets do /admin para planos e mensalidades), uma planilha Google para o funil, WhatsApp Business (grátis), Meta Business Suite (grátis), o gateway PIX e o emissor de nota de serviço (NFS-e) que o contador indicar.

### Registros, licenças e regras a confirmar
(Regras mudam e variam por cidade; confirme cada uma com o órgão ou com um profissional. Não é assessoria jurídica.)
- [ ] **CNPJ** como ME no Simples Nacional, com o CNAE que o contador indicar (provável 6319-4/00, portais e serviços de informação na internet). Abertura pela Junta Comercial do RS (JucisRS) e pelo gov.br.
- [ ] **Alvará** na Prefeitura de Santiago: atividade digital sem atendimento ao público costuma ser de baixo risco e pode ser dispensada (Lei de Liberdade Econômica, 13.874/2019); confirmar na prefeitura.
- [ ] **Nota fiscal de serviço (NFS-e)** para cada assinatura cobrada.
- [ ] **LGPD**: a política de privacidade já existe no app; definir o canal do encarregado e revisar o que o app guarda (CPF, localização).
- [ ] **Marco Civil da Internet** (Lei 12.965/2014, art. 15): o provedor de aplicação com CNPJ guarda os registros de acesso por 6 meses.
- [ ] **Código de Defesa do Consumidor** (art. 36): patrocinado identificado como tal (bloqueios 2 e 3).
- [ ] **CFMV, Res. 1.649/2025 (publicidade)**: obriga o vet, não o app, mas o app não pode empurrar o vet a infringir: nada de selo de distinção comprado nem tabela de preço de procedimento. O art. 9º prevê comissões de publicidade nos CRMVs, que podem emitir parecer: **pedir parecer ao CRMV-RS** sobre o destaque "Patrocinado". Isso também responde a uma objeção do painel.
- [ ] **CFMV, Res. 1.690/2026 (atendimento domiciliar)**: em vigor desde 23/01/2026, para pets de pequeno porte. Proíbe em casa cirurgia (salvo sutura superficial, coleta e drenagem de abscesso), anestesia geral (salvo eutanásia), transfusão e outros. O vet decide e responde. O app pode ajudar: avisar no pedido que alguns procedimentos não são feitos em domicílio.

### Riscos
| risco | chance | impacto | plano |
| --- | --- | --- | --- |
| Poucos pedidos de tutores | alta | fatal | É o teste de novembro; com menos de 3 pedidos por semana na semana 2, trocar o gancho; na semana 4, parar e repensar |
| Vet não responde a tempo | média | alto | Concierge por WhatsApp e aviso de pedido pelo WhatsApp |
| Vet usa o Premium sem pagar (bloqueio 1) | baixa depois de publicar as regras | alto | Publicar as regras antes de abrir; revisar quem ativou pelo BEMVINDO |
| Vet não vê pedido com o app fechado (sem push) | alta | alto | Concierge por WhatsApp em até 1h; combinar com cada vet o aviso por WhatsApp |
| Alguém copia a chave da Groq do app | média | baixo | Chave com limite de gasto baixo, ou IA desligada no lançamento |
| Esquecer de conferir um PIX | média | baixo | Olhar a aba Vets toda sexta ("mensalidade paga até") |
| CRMV-RS questiona o destaque pago | baixa a média | alto | "Patrocinado" e parecer do CRMV-RS antes |
| Tutor marca e não está em casa | média | médio | Confirmação no dia; depois, sinal via PIX |
| Atendimento ruim vira reclamação pública | média | médio | Rotina de reclamação; orientar sobre o CRMV-RS |
| Custo do Firebase ou da IA dispara | baixa | médio | Alertas de orçamento |
| Fundador sem tempo (é uma pessoa só) | média | alto | Limitar o concierge a 3 horários por dia |
| Vet leva o cliente para o WhatsApp e some do app | alta | médio | Aceitar: o app cobra mensalidade, não comissão; o valor é trazer o **primeiro** contato |
| Mercado pequeno demais (49 mil habitantes) | alta | alto | Ver financeiro.md: depois de provar, a fase 2 é região (cidades vizinhas) ou o campo |

## Launch plan

### 1. O teste antes de gastar: novembro de 2026
O teste é o próprio mês de abertura em Santiago, com o dinheiro mínimo (R$ 500) e sem abrir CNPJ antes de ver o resultado.

**Linha de sucesso, escrita antes (até 13/12/2026):**
- **10 vets** cadastrados e ativos (foto, raio, respondem a pedidos).
- **30 pedidos reais** de tutores no app em 4 semanas.
- **12 atendimentos realizados e pagos** (ao vet, direto pelo tutor).
- **3 vets** chegando às 3 visitas pagas da oferta Vet Fundador.

Comparação com o painel: ele disse que 20% dos vets pagariam se os clientes viessem. O teste mede **se os clientes vêm**, que é o que o painel não tem como saber. Se a realidade ficar bem abaixo (menos de 10 pedidos em 4 semanas), **acredite na realidade**: não abra CNPJ, não gaste mais, e volte a `/founder-offer` com outra proposta para o tutor, ou mude a cunha (campo, plantão de temporada).

### 2. Contagem regressiva
| semana | o que | prazo | caminho crítico |
| --- | --- | --- | --- |
| 22/10 a 25/10 | ~~Corrigir os bloqueios 1 a 4 de operacao.md~~ (feito no código) → **publicar** regras e hosting (sem Blaze; comandos em operacao.md), virar admin e revisar quem usou o BEMVINDO | 25/10 | **sim** |
| 22/10 a 25/10 | Montar a lista de vets de Santiago: consulta pública de inscritos no site do CRMV-RS, Google Maps, perguntar nos pet shops | 25/10 | **sim** |
| 26/10 a 01/11 | Definir a meta de vets ativos (condição do conselho): contar quantos atendem fora da clínica na lista e mirar pelo menos metade deles, com no mínimo 10 | 01/11 | **sim** |
| 26/10 a 01/11 | Lembrete de vacina a partir do "caderno do pet" (o motivo para voltar ao app) | 13/11 | não |
| 26/10 a 01/11 | Pedir 3 orçamentos de contador (só contratar se o teste passar) | 01/11 | não |
| 26/10 a 01/11 | Registrar `avantevet.com.br`; criar @avantevet; perfil no Google | 01/11 | não |
| 26/10 a 01/11 | Enviar pedido de parecer ao CRMV-RS sobre o "Patrocinado" | 01/11 | não (resposta pode demorar) |
| 02/11 a 06/11 | Visitar 15 vets e fechar 10 fundadores (rotina em operacao.md) | 06/11 | **sim** |
| 05/11 a 11/11 | Cartazes nos pet shops e agropecuárias; pauta na rádio | 11/11 | não |
| 09/11 a 13/11 | Lista de espera e posts D-7 a D-3 (marketing.md) | 13/11 | não |
| **14/11 (sábado)** | **Abertura de teste**: 5 tutores conhecidos fazem pedidos de verdade, com vets fundadores. Observar cada um do começo ao fim (condição do conselho) e anotar onde travam; repetir com 5 vets aceitando o pedido | 14/11 | **sim** |
| **16/11 (segunda)** | **Abertura em Santiago** | 16/11 | |

### 3. O dia da abertura (16/11)
| hora | o quê |
| --- | --- |
| 7h | Conferir o app: cadastro, pedido, chat, mapa. Fazer um pedido de teste e cancelar. |
| 8h | Mensagem para a lista de espera; post "abriu" no Instagram e nos grupos de Facebook. |
| 8h30 | Ligar o anúncio da Meta (R$ 10/dia, ganchos 1 e 2). |
| 9h a 12h | Concierge: cada pedido com vet em até 1 hora; se travar, WhatsApp. (Sem Blaze não há push: o vet só vê o pedido com o app aberto, então avise por WhatsApp todo pedido novo.) |
| 12h | Mensagem aos 10 vets: "abriu, fiquem de olho nos pedidos". |
| 14h a 18h | Concierge. Visitar 2 pet shops para ver se os cartazes estão no lugar. |
| 20h | Planilha: pedidos, aceites, atendimentos. |

Se algo quebrar: o app cair (avisar nos grupos, desligar o anúncio, corrigir); nenhum vet aceitar (concierge, e se não der, avisar o tutor e indicar clínica); reclamação (rotina em operacao.md).

### 4. Os primeiros 30 dias
**Toda semana**: pedidos de tutores, % aceitos em até 2 horas, atendimentos realizados e pagos, vets ativos e custo por pedido no anúncio.

| revisão | perguntas | gatilho de mudança |
| --- | --- | --- |
| **Dia 7 (23/11)** | Chegaram pedidos? De onde (anúncio, cartaz, rádio)? Os vets responderam? | Menos de 3 pedidos: trocar o gancho. Menos de 50% aceitos: problema de vet. |
| **Dia 14 (30/11)** | Algum atendimento foi pago? O que os tutores disseram? Que gancho funcionou? | Zero atendimentos realizados: entrevistar 5 tutores que pediram e não fecharam. |
| **Dia 30 (16/12)** e fechamento do teste em 13/12 | A linha de sucesso foi batida? | **Passou**: abrir o CNPJ e a conta PJ, começar a receber os PIX dos Fundadores que bateram 3 atendimentos (aba Vets do admin), divulgação de R$ 200/mês, planejar a fase 2 (cidades vizinhas ou campo). **Não passou**: não abrir empresa, rever a oferta para o tutor ou a cunha. |

_The panel is simulated buyers and the numbers are projections from your inputs. Confirm demand with real customers and costs with real quotes before you spend. Not financial, legal or tax advice._
