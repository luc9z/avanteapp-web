# Operação

## Como o app roda (corrigido em 22/10)
O Firebase continua no plano **gratuito** (sem Blaze). O que precisa de servidor roda num **Cloudflare Worker gratuito** (pasta `worker/`), já publicado em `avante-servidor.avanteapp.workers.dev`. A primeira versão deste manual foi escrita a partir de um código de junho, sem esse servidor, e descrevia tudo manual. Como é de verdade:

| o quê | como fica |
| --- | --- |
| Ativar plano pago | O vet assina na tela de Planos (assinatura recorrente da Cakto) e o plano ativa e renova sozinho. Antes de cobrar alguém, as ofertas da Cakto precisam estar coladas na aba Planos do admin e o webhook ligado ao servidor. |
| Vet Fundador | O vet toca em "Quero ser Vet Fundador" e o servidor ativa o Premium grátis na hora, conferindo as 30 vagas (`config/fundador`). |
| Contar os 3 atendimentos | O servidor conta uma vez por dia: pedido finalizado **depois** da adesão e confirmado pelo cliente (ou 48h sem resposta). O painel e a tela de Planos mostram "X de 3" na hora. |
| Fim do período grátis | Na meta, o plano ganha 5 dias para o vet pagar R$ 29,90 (travado por 12 meses). Sem pagamento, volta ao Free sozinho. |
| Mensal vencido | A tarefa diária devolve ao Free. |
| Notificação de pedido novo | Só com o app aberto. Com o app fechado, o vet **não** é avisado; o servidor pode passar a mandar esse aviso (próximo passo técnico). Até lá, o concierge por WhatsApp (abaixo) é obrigatório. |

## O que foi corrigido no app (branch `integra-nuvem`)
1. ✅ **Cupom BEMVINDO fixo no servidor** dava Premium grátis e sem vencimento a quem digitasse, e a tela sugeria o código. Agora só vale cupom criado no admin (`config/coupons`).
2. ✅ **A triagem com IA recomendava quem paga.** Agora escolhe por espécie, online e nota.
3. ✅ **O selo dizia "Destaque".** Agora "Patrocinado", e os Termos de Uso explicam que é anúncio pago e como funciona o Vet Fundador.
4. ✅ **O vet podia marcar a confirmação no lugar do cliente** (e inflar a própria contagem). Agora a confirmação é só do cliente, e o "Recebi o pagamento" só do vet.
5. ✅ **Vet Fundador automático**, com vaga, contagem e cobrança pelo servidor. 81 testes de regras e o teste do servidor de ponta a ponta passando.
6. ✅ **Premium padrão a R$ 49,90.**

**Para publicar** (do seu computador, na pasta `avanteapp-web`, branch `integra-nuvem`):
```
npm run build
npx firebase deploy --only firestore:rules,hosting --project avante-pro
cd worker
npx wrangler deploy
```
Não rode `firebase deploy` sem `--only`: ele tentaria publicar as Cloud Functions, o que exige o Blaze. **Publique sempre a partir da `main`**: ela é a versão que está no ar.

**Antes de abrir para os vets:**
- Você já é admin.
- Veja no Firestore quem tem `planCoupon: BEMVINDO` e decida se mantém.
- **Chave da Groq**: fica só no servidor (`npx wrangler secret put GROQ_API_KEY` na pasta `worker`), nunca em `VITE_GROQ_KEY`. Até a versão de 22/10 ela ia dentro do site publicado; deixe um limite de gasto na Groq.

## O ciclo do dia (o fundador, sozinho)
1. 8h: ver pedidos novos da noite. **(o cliente vê)**
2. Pedido sem resposta de vet em 1 hora: chamar um vet por WhatsApp (modo "concierge" nas primeiras semanas). **(o cliente vê o resultado)**
3. 12h e 18h: repetir o passo 2.
4. Depois de cada atendimento: perguntar ao tutor se correu bem (2 linhas, por WhatsApp). **(o cliente vê)**
5. 20h: anotar na planilha os pedidos, aceites, atendimentos realizados e pagos e os vets ativos.
6. Sexta: rodar a revisão semanal (ver lancamento.md).

## Fornecedores
| item | opções | custo | observação |
| --- | --- | --- | --- |
| Recebimento da mensalidade | Assinatura recorrente da Cakto pelo app, ativação e renovação automáticas pelo servidor | taxa da Cakto (confira no painel) | precisa das ofertas criadas na Cakto e do webhook ligado |
| Contador | contador de Santiago e 2 contabilidades online | estimativa R$ 150/mês | pedir orçamento já perguntando CNAE, Anexo III ou V, fator R e pró-labore |
| Hospedagem | Firebase no plano gratuito (Spark) + Cloudflare Workers gratuito | R$ 0 | o servidor faz o que as Cloud Functions fariam |
| IA | Groq | estimativa R$ 20/mês | alerta de uso |
| Impressos | gráfica local de Santiago | estimativa R$ 100 a R$ 300 | 10 cartazes A3 e 500 panfletos |
| Anúncios | Meta Ads | R$ 300 em novembro | cartão do fundador até ter CNPJ |

## Pessoas
Só o fundador. Estimativa de **10 a 12 horas por semana** no primeiro mês (visitas aos vets, concierge dos pedidos, conteúdo), caindo para 5 a 6 depois. Sem salário no plano (ver financeiro.md). Pró-labore e INSS: o contador define junto com o enquadramento.

## Rotinas (uma página cada)
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

## Ferramentas
O app (já pronto: cobrança e Vet Fundador automáticos pelo servidor), uma planilha Google para o funil, WhatsApp Business (grátis), Meta Business Suite (grátis), o gateway PIX e o emissor de nota de serviço (NFS-e) que o contador indicar.

## Registros, licenças e regras a confirmar
(Regras mudam e variam por cidade; confirme cada uma com o órgão ou com um profissional. Não é assessoria jurídica.)
- [ ] **CNPJ** como ME no Simples Nacional, com o CNAE que o contador indicar (provável 6319-4/00, portais e serviços de informação na internet). Abertura pela Junta Comercial do RS (JucisRS) e pelo gov.br.
- [ ] **Alvará** na Prefeitura de Santiago: atividade digital sem atendimento ao público costuma ser de baixo risco e pode ser dispensada (Lei de Liberdade Econômica, 13.874/2019); confirmar na prefeitura.
- [ ] **Nota fiscal de serviço (NFS-e)** para cada assinatura cobrada.
- [ ] **LGPD**: a política de privacidade já existe no app; definir o canal do encarregado e revisar o que o app guarda (CPF, localização).
- [ ] **Marco Civil da Internet** (Lei 12.965/2014, art. 15): o provedor de aplicação com CNPJ guarda os registros de acesso por 6 meses.
- [ ] **Código de Defesa do Consumidor** (art. 36): patrocinado identificado como tal (bloqueios 2 e 3).
- [ ] **CFMV, Res. 1.649/2025 (publicidade)**: obriga o vet, não o app, mas o app não pode empurrar o vet a infringir: nada de selo de distinção comprado nem tabela de preço de procedimento. O art. 9º prevê comissões de publicidade nos CRMVs, que podem emitir parecer: **pedir parecer ao CRMV-RS** sobre o destaque "Patrocinado". Isso também responde a uma objeção do painel.
- [ ] **CFMV, Res. 1.690/2026 (atendimento domiciliar)**: em vigor desde 23/01/2026, para pets de pequeno porte. Proíbe em casa cirurgia (salvo sutura superficial, coleta e drenagem de abscesso), anestesia geral (salvo eutanásia), transfusão e outros. O vet decide e responde. O app pode ajudar: avisar no pedido que alguns procedimentos não são feitos em domicílio.

## Riscos
| risco | chance | impacto | plano |
| --- | --- | --- | --- |
| Poucos pedidos de tutores | alta | fatal | É o teste de novembro; com menos de 3 pedidos por semana na semana 2, trocar o gancho; na semana 4, parar e repensar |
| Vet não responde a tempo | média | alto | Concierge por WhatsApp e aviso de pedido pelo WhatsApp |
| Vet usa o Premium sem pagar (bloqueio 1) | baixa depois de publicar as regras | alto | Publicar as regras antes de abrir; revisar quem ativou pelo BEMVINDO |
| Vet não vê pedido com o app fechado (sem push) | alta | alto | Concierge por WhatsApp em até 1h; combinar com cada vet o aviso por WhatsApp |
| Alguém copia a chave da Groq do app | média | baixo | Chave com limite de gasto baixo, ou IA desligada no lançamento |
| Pagamento do Fundador não confirmar | baixa | baixo | Olhar `payments` no Firestore toda sexta; o servidor só ativa com o aviso assinado pela Cakto, e o plano sai da oferta paga |
| CRMV-RS questiona o destaque pago | baixa a média | alto | "Patrocinado" e parecer do CRMV-RS antes |
| Tutor marca e não está em casa | média | médio | Confirmação no dia; depois, sinal via PIX |
| Atendimento ruim vira reclamação pública | média | médio | Rotina de reclamação; orientar sobre o CRMV-RS |
| Custo do Firebase ou da IA dispara | baixa | médio | Alertas de orçamento |
| Fundador sem tempo (é uma pessoa só) | média | alto | Limitar o concierge a 3 horários por dia |
| Vet leva o cliente para o WhatsApp e some do app | alta | médio | Aceitar: o app cobra mensalidade, não comissão; o valor é trazer o **primeiro** contato |
| Mercado pequeno demais (49 mil habitantes) | alta | alto | Ver financeiro.md: depois de provar, a fase 2 é região (cidades vizinhas) ou o campo |
