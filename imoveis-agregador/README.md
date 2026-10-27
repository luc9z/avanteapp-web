# Aluga Canoas: agregador de apartamentos para alugar

Busca os apartamentos para alugar em **Canoas/RS** direto nos sites das imobiliárias e mostra tudo numa tela só, com filtros por preço, quartos, vagas, área, bairro, tipo e imobiliária.

Cada anúncio leva para a página original da imobiliária, onde se faz o contato.

## Imobiliárias incluídas

| Imobiliária | Site | Como os dados são lidos |
|---|---|---|
| Auxiliadora Predial | auxiliadorapredial.com.br | Dados estruturados schema.org (JSON-LD) |
| Imobiliária Gestão | imobiliariagestao.com.br | API GraphQL do site (plataforma Sobressai) |
| Moresco Imóveis | morescoimoveis.com.br | API GraphQL do site (plataforma Sobressai) |
| Gallina Imóveis | gallinaimoveis.com.br | Dados do CRM Vista embutidos na página |
| Imobiliária Lottici | imobiliarialottici.com.br | Dados do CRM Vista embutidos na página |
| Prime Class Imobiliária | primeclassimobiliaria.com.br | API do CRM Vista usada pelo site |
| OPEN Imobiliária | openimobiliaria.com.br | Leitura dos cards HTML |
| Ágora Cia Imobiliária | agora.imb.br | Leitura dos cards HTML |

Na primeira coleta (out/2026) foram **724 apartamentos** em cerca de 50 segundos.

Algumas imobiliárias de Canoas **bloqueiam leitura automática** (Vila Rica, Brandalise, Aurora e Crédito Real). Elas aparecem na tela "Imobiliárias pesquisadas", com link para consultar direto no site. O sistema não tenta burlar esses bloqueios.

## Como rodar

Requisitos: **Node.js 18.18 ou mais novo**.

```bash
cd imoveis-agregador
npm install
npm run dev
```

- Interface: http://localhost:5173
- API: http://localhost:3001

Na primeira vez o servidor já começa a coletar os anúncios sozinho (cerca de 1 minuto). Depois disso a coleta se repete **a cada 6 horas**. Também dá para atualizar pelo botão **Atualizar anúncios** ou pelo terminal:

```bash
npm run coletar
```

### Produção (um único servidor)

```bash
npm run build   # compila a interface em web/dist
npm start       # API + interface em http://localhost:3001
```

### Configuração (variáveis de ambiente)

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `3001` | Porta da API |
| `COLETA_INTERVALO_HORAS` | `6` | Intervalo da coleta automática (`0` desliga) |
| `PASTA_DADOS` | `server/data` | Onde fica o `imoveis.json` com os anúncios |

## Recursos da interface

- Filtros por aluguel (mínimo/máximo e atalhos "até R$ 2.000"), quartos, vagas, área, bairro, tipo (apartamento, kitnet, cobertura, loft…) e imobiliária
- Busca por texto (rua, condomínio, "mobiliado", "piscina"…), sem diferença de acentos
- Ordenação por menor aluguel, menor custo total (aluguel + condomínio + IPTU, quando a imobiliária informa), menor preço por m², maior área e mais recentes
- **Favoritos** salvos no navegador
- Selo **Novo** nos anúncios que apareceram nas últimas 48 horas
- **Repetidos**: o mesmo apartamento anunciado por duas imobiliárias (mesmo bairro, quartos, área e aluguel) mostra "Também anunciado por…", e há um filtro para esconder as cópias
- Os filtros ficam na URL: dá para salvar a busca nos favoritos do navegador ou compartilhar
- Funciona no celular (os filtros abrem numa gaveta lateral)

## Como funciona

```
server/src/
├── index.js              API (Express) + coleta automática
├── coletor.js            roda todas as fontes em paralelo, junta e salva
├── busca.js              filtros, ordenação e paginação
├── armazenamento.js      leitura e gravação de data/imoveis.json
├── lib/
│   ├── http.js           requisições com timeout, novas tentativas e pausa entre páginas
│   └── normalizar.js     formato único: preço, tipo, bairro ("Mal. Rondon" → "Marechal Rondon")…
└── fontes/
    ├── index.js          cadastro das imobiliárias
    └── plataformas/      um leitor por plataforma de site
        ├── jsonld.js     schema.org RealEstateListing
        ├── sobressai.js  API GraphQL da Sobressai
        ├── vista.js      CRM Vista (API ou dados embutidos na página)
        └── html.js       leitura de cards HTML (OPEN, Ágora)
web/src/                  interface React + Tailwind
```

Se um site estiver fora do ar na hora da coleta, os anúncios dele da coleta anterior continuam aparecendo, e a tela de imobiliárias mostra o erro.

### Adicionar uma imobiliária

1. Abra o site da imobiliária e descubra a plataforma. Fotos em `cdn.vistahost.com.br` indicam Vista; `fotos.sobressai.com.br`, Sobressai; `"RealEstateListing"` no código-fonte da busca, JSON-LD.
2. Se for uma plataforma já suportada, basta uma entrada em `server/src/fontes/index.js`. Por exemplo, um site Vista:
   ```js
   fonteVistaSite({ id: 'nova', nome: 'Imobiliária Nova', site: 'https://www.imobiliarianova.com.br' }),
   ```
   Para Sobressai, `codsite` e `idCidade` aparecem no `__NEXT_DATA__` da página (`codsite` e `allDataHome.cidades`).
3. Se não for, escreva um leitor de cards em `plataformas/html.js`, no modelo de `lerCardsOpen`, e um teste em `server/test/plataformas.test.js`.
4. Rode `npm run coletar` e confira a contagem.

Sites mudam de layout com o tempo. Quando uma imobiliária passar a aparecer com erro ou com 0 apartamentos, o leitor dela precisa de ajuste.

## Testes

```bash
npm test
```

Os testes cobrem a leitura de cada plataforma (com trechos do HTML/JSON real dos sites), a normalização dos dados e os filtros da busca.

## Uso responsável

- A coleta faz poucas requisições, uma página por vez com pausa entre elas, e respeita o `robots.txt` de cada site (conferido em out/2026)
- Não burla proteções anti-robô: sites que bloqueiam ficam de fora
- Todo anúncio aponta para o site da imobiliária, que continua sendo onde o contato acontece
- Feito para uso pessoal. Antes de publicar o sistema para outras pessoas, confira os termos de uso de cada site ou peça autorização às imobiliárias
