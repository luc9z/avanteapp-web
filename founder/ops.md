# Operação

## Bloqueios no app (achados no código; 1 a 4 já corrigidos no branch)
1. ✅ **Qualquer vet podia virar Premium de graça.** As regras deixavam o próprio usuário gravar `plan` e `featured`, e a tela de planos validava os cupons BEMVINDO e AVANTE100 no navegador e anunciava o BEMVINDO para todos. **Corrigido**: `firestore.rules` bloqueia o dono de gravar plano pago, destaque, cupom, nota, contagem de visitas e `crmvVerified: true` (17 testes no emulador passando); o cupom só vale pela Cloud Function `redeemCoupon`, lido de `config/coupons`, com limite de usos e uso único por vet; o aviso do BEMVINDO saiu da tela.
2. ✅ **A triagem com IA recomendava quem paga, sem avisar.** **Corrigido**: a IA escolhe por espécie, online e nota; o plano não entra mais na escolha nem no prompt.
3. ✅ **O selo dizia "Destaque".** **Corrigido**: virou "Patrocinado" na busca e no assistente, e os Termos de Uso explicam que é anúncio pago.
4. ✅ **A regra das 3 visitas não era medida.** **Corrigido**: no atendimento finalizado, o vet toca em "Recebi o pagamento"; a função `onRequestPaidVisit` conta 1 atendimento pago quando o cliente também confirmou; no 3º, marca o fim do período grátis do Fundador. O painel do vet mostra "Vet Fundador · X de 3".
5. ⏳ **O pagamento está "em breve".** Ligar a cobrança PIX recorrente (AbacatePay já está no código) antes de o primeiro Fundador completar as 3 visitas. Só depois de abrir o CNPJ.

**Para valer no app no ar, falta publicar** (do seu computador, com o Firebase CLI logado):
```
firebase deploy --only firestore:rules
cd functions && npm install && cd .. && firebase deploy --only functions
npm run build && firebase deploy --only hosting
```
As Cloud Functions exigem o plano Blaze do Firebase. **Atenção**: com as regras novas, ninguém ativa plano pago sem a função `redeemCoupon` publicada (ou sem você editar o vet pelo console do Firebase). Vets que já ativaram Premium pelo BEMVINDO continuam Premium; revise-os no console se quiser.

**Cupom das 30 vagas** (criar no console, documento `config/coupons`):
```
FUNDADOR: { discount: 100, active: true, maxUses: 30, used: 0, plans: ["premium"], fundador: true, fundadorPrice: 29.9 }
```
Limite conhecido: cliente e vet podem editar a solicitação inteira (regra antiga de `requests`), então um vet com duas contas conseguiria inflar a própria contagem. Para 30 vets numa cidade pequena, o risco é baixo; rever quando houver cobrança automática.

## O ciclo do dia (o fundador, sozinho)
1. 8h: ver pedidos novos da noite. **(o cliente vê)**
2. Pedido sem resposta de vet em 1 hora: chamar um vet por WhatsApp (modo "concierge" nas primeiras semanas). **(o cliente vê o resultado)**
3. 12h e 18h: repetir o passo 2.
4. Depois de cada atendimento: perguntar ao tutor se correu bem (2 linhas, por WhatsApp). **(o cliente vê)**
5. 20h: anotar na planilha os pedidos, aceites, atendimentos realizados e pagos e os vets ativos.
6. Sexta: rodar a revisão semanal (ver launch.md).

## Fornecedores
| item | opções | custo | observação |
| --- | --- | --- | --- |
| Cobrança PIX recorrente | AbacatePay (já no código), Asaas, Mercado Pago | taxa por cobrança, ver painel de cada um | pegar a tabela oficial antes de decidir; Asaas documenta PIX recorrente ([docs](https://docs.asaas.com/docs/recurring-pix)) |
| Contador | contador de Santiago e 2 contabilidades online | estimativa R$ 150/mês | pedir orçamento já perguntando CNAE, Anexo III ou V, fator R e pró-labore |
| Hospedagem | Firebase (Blaze) | estimativa R$ 30/mês | ativar alerta de orçamento no Google Cloud (ex.: R$ 50) |
| IA | Groq | estimativa R$ 20/mês | alerta de uso |
| Impressos | gráfica local de Santiago | estimativa R$ 100 a R$ 300 | 10 cartazes A3 e 500 panfletos |
| Anúncios | Meta Ads | R$ 300 em novembro | cartão do fundador até ter CNPJ |

## Pessoas
Só o fundador. Estimativa de **10 a 12 horas por semana** no primeiro mês (visitas aos vets, concierge dos pedidos, conteúdo), caindo para 5 a 6 depois. Sem salário no plano (ver cfo.md). Pró-labore e INSS: o contador define junto com o enquadramento.

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
O app (já pronto), uma planilha Google para o funil, WhatsApp Business (grátis), Meta Business Suite (grátis), o gateway PIX e o emissor de nota de serviço (NFS-e) que o contador indicar.

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
| Vet usa o Premium sem pagar (bloqueio 1) | alta hoje | alto | Corrigir as regras antes de abrir |
| CRMV-RS questiona o destaque pago | baixa a média | alto | "Patrocinado" e parecer do CRMV-RS antes |
| Tutor marca e não está em casa | média | médio | Confirmação no dia; depois, sinal via PIX |
| Atendimento ruim vira reclamação pública | média | médio | Rotina de reclamação; orientar sobre o CRMV-RS |
| Custo do Firebase ou da IA dispara | baixa | médio | Alertas de orçamento |
| Fundador sem tempo (é uma pessoa só) | média | alto | Limitar o concierge a 3 horários por dia |
| Vet leva o cliente para o WhatsApp e some do app | alta | médio | Aceitar: o app cobra mensalidade, não comissão; o valor é trazer o **primeiro** contato |
| Mercado pequeno demais (49 mil habitantes) | alta | alto | Ver cfo.md: depois de provar, a fase 2 é região (cidades vizinhas) ou o campo |
