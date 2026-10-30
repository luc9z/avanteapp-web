# 🐾 Avante — Veterinária a Domicílio

Plataforma web que conecta **tutores** a **médicos veterinários** para atendimento a domicílio: busca por proximidade e especialidade, agendamento em etapas, chat em tempo real, avaliações, planos para profissionais e um assistente de triagem com IA.

🔗 **App no ar:** [avante-pro.web.app](https://avante-pro.web.app)

---

## ✨ Funcionalidades

### Para o cliente (tutor)
- Cadastro de **animais** e **propriedades** (locais de atendimento)
- Busca de veterinários por especialidade, proximidade e disponibilidade (online)
- **Agendamento em etapas**: serviço → animal → data/horário → local → confirmação (sem datas retroativas)
- **Chat** em tempo real com envio de localização
- **Assistente IA** de triagem (Llama 3.3 via Groq) que orienta e sugere o vet mais adequado
- Avaliações, favoritos e histórico de solicitações

### Para o veterinário
- Painel com status **online/offline**, resumo do mês e solicitações pendentes
- **Agenda** de atendimentos e relatórios em tempo real
- Edição de perfil com **foto**, áreas de atuação e raio de atendimento
- **Planos**: Free, Essencial e Premium (recursos liberados por plano)
- Chat antes da solicitação **exclusivo do plano Premium**

### Para o admin
- Gestão de **ofertas/anúncios** segmentados por público (clientes / veterinários), tamanho e cor
- Configuração de **planos** (valores e benefícios)

---

## 🧱 Stack

- **React 18 + Vite**
- **Firebase** — Authentication, Firestore, Hosting, Cloud Functions
- **Tailwind CSS** + SCSS (tema claro/escuro)
- **Groq** (Llama 3.3) para o assistente de IA
- **Leaflet** para mapas / seleção de local

---

## 🚀 Como rodar localmente

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env.local   # preencha com suas chaves do Firebase e do Groq

# 3. Ambiente de desenvolvimento
npm run dev

# 4. Build de produção
npm run build
```

### Variáveis de ambiente (`.env.local`)

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_SERVIDOR_URL=...             # servidor (worker/): pagamento, cupom, CPF e IA
VITE_FIREBASE_VAPID_KEY=...       # opcional — notificações push web
```

A chave da IA (Groq) é segredo do servidor, nunca `VITE_`:

```bash
cd worker && npx wrangler secret put GROQ_API_KEY
```

---

## 📦 Deploy (Firebase)

```bash
npm run build
firebase deploy --only hosting             # site
firebase deploy --only firestore:rules     # regras de seguranca
cd worker && npx wrangler deploy           # servidor (Cloudflare Workers)
```

`functions/` é a alternativa em Cloud Functions (exige o plano Blaze) e não
está em uso: quem roda em produção é o `worker/`.

---

## 💳 Assinaturas pela Cakto

Os planos pagos são assinaturas recorrentes da Cakto. O app abre o link da
oferta; a Cakto avisa o servidor (`/webhook/cakto`) a cada pagamento,
renovação, cancelamento ou estorno, e o servidor ativa, renova ou encerra o
plano. O plano liberado é sempre o da **oferta paga**.

1. **Na Cakto**, crie um produto de assinatura com uma oferta para cada
   cobrança: Premium mensal, Premium anual (10× o mensal), Essencial mensal e
   anual, e a do Vet Fundador (R$ 29,90/mês). O preço de cada oferta tem que
   ser o mesmo da aba Planos do admin.
2. **No admin do app (aba Planos)**, cole o link de cada oferta
   (`https://pay.cakto.com.br/...`) no campo correspondente e salve.
3. **Na Cakto, crie o webhook** para o produto, com a URL
   `https://avante-servidor.avanteapp.workers.dev/webhook/cakto` e os eventos
   `purchase_approved`, `subscription_renewed`, `subscription_late_recovered`,
   `subscription_canceled`, `subscription_renewal_refused`, `subscription_late`,
   `refund` e `chargeback`. Guarde o `secret` que a Cakto devolve:
   ```bash
   cd worker && npx wrangler secret put CAKTO_WEBHOOK_SECRET
   ```
4. **Página de obrigado** da oferta: `https://avante.vet.br/plans?status=paid`.
5. **Teste**: use "enviar evento de teste" da Cakto e confira em
   `payments_events/` no Firestore.

Cupom de 100% continua sendo do app (admin → `config/coupons`). Cupom de
desconto parcial é digitado no checkout da Cakto: crie o mesmo código lá.

Testes: `(cd worker && npm install)` e depois `npm run test:servidor`.

---

## 📁 Estrutura

```
src/
├── components/      # UI compartilhada (BottomNav, AdBanner, ScheduleSheet, IA...)
├── contexts/        # Auth e Tema
├── pages/
│   ├── auth/        # login, registro, splash
│   ├── client/      # home, animais, favoritos, agendamento, avaliacao
│   ├── professional/# dashboard, agenda, relatorios, planos, perfil
│   ├── shared/      # chat, lista de conversas
│   └── admin/       # ofertas e planos
├── services/        # chat direto, push, favoritos, roles
└── utils/           # especialidades, validadores, status, geo
```

---

## 🗺️ Próximos passos

- Prontuário digital do pet e teleconsulta

---

Desenvolvido por **Lucas Melo**.
