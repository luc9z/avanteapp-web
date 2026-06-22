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
VITE_GROQ_KEY=...                 # assistente IA (console.groq.com)
VITE_FIREBASE_VAPID_KEY=...       # opcional — notificações push web
```

---

## 📦 Deploy (Firebase)

```bash
npm run build
firebase deploy --only hosting             # site
firebase deploy --only firestore:rules     # regras de seguranca
firebase deploy --only functions           # funcoes (requer plano Blaze)
```

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

- Pagamento real dos planos (AbacatePay / PIX) — hoje em modo de teste
- Notificações push (FCM) com Cloud Function de envio
- Exclusão automática de chats expirados (7 dias) via função agendada
- Prontuário digital do pet e teleconsulta

---

Desenvolvido por **Lucas Melo**.
