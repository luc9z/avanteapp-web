// Cadastro das imobiliárias de Canoas/RS coletadas pelo sistema.
//
// Para adicionar uma imobiliária, veja se o site usa uma das plataformas já
// suportadas (Vista, Sobressai, JSON-LD) e basta incluir uma linha aqui.
// Se não usar, crie um leitor de cards em plataformas/html.js.
import { fonteHtml, lerCardsAgora, lerCardsOpen } from './plataformas/html.js';
import { fonteJsonLd } from './plataformas/jsonld.js';
import { fonteSobressai } from './plataformas/sobressai.js';
import { fonteVistaApi, fonteVistaSite } from './plataformas/vista.js';

// Algumas imobiliárias também anunciam em cidades vizinhas; só esta é mantida.
export const CIDADE = 'Canoas';

export const FONTES = [
  fonteJsonLd({
    id: 'auxiliadora',
    nome: 'Auxiliadora Predial',
    site: 'https://www.auxiliadorapredial.com.br',
    urlDaPagina: (n) => `https://www.auxiliadorapredial.com.br/alugar/residencial/rs+canoas?page=${n}`,
  }),
  fonteSobressai({
    id: 'gestao',
    nome: 'Imobiliária Gestão',
    site: 'https://imobiliariagestao.com.br',
    codsite: 207,
    idCidade: 801,
  }),
  fonteSobressai({
    id: 'moresco',
    nome: 'Moresco Imóveis',
    site: 'https://www.morescoimoveis.com.br',
    codsite: 110,
    idCidade: 2835,
  }),
  fonteVistaSite({
    id: 'gallina',
    nome: 'Gallina Imóveis',
    site: 'https://gallinaimoveis.com.br',
  }),
  fonteVistaSite({
    id: 'lottici',
    nome: 'Imobiliária Lottici',
    site: 'https://imobiliarialottici.com.br',
  }),
  fonteVistaApi({
    id: 'primeclass',
    nome: 'Prime Class Imobiliária',
    site: 'https://primeclassimobiliaria.com.br',
  }),
  fonteHtml({
    id: 'open',
    nome: 'OPEN Imobiliária',
    site: 'https://openimobiliaria.com.br',
    urlDaPagina: (n) => `https://openimobiliaria.com.br/imoveis?purpose=aluguel&cidade=Canoas&pagina=${n}`,
    lerPagina: lerCardsOpen,
  }),
  fonteHtml({
    id: 'agora',
    nome: 'Ágora Cia Imobiliária',
    site: 'https://agora.imb.br',
    // categorias: Apartamento, Cobertura, Kitnet, Loft
    urlDaPagina: (n) =>
      `https://agora.imb.br/locacao/busca?category%5B%5D=1265&category%5B%5D=1269&category%5B%5D=1275&category%5B%5D=1278&page=${n}`,
    lerPagina: lerCardsAgora,
  }),
];

// Imobiliárias encontradas na pesquisa mas cujo site bloqueia acesso
// automatizado (desafio anti-robô). Aparecem na tela de fontes para o
// usuário consultar manualmente.
export const FONTES_BLOQUEADAS = [
  { id: 'vilarica', nome: 'Vila Rica Imóveis', site: 'https://www.vilarica.com.br/alugar/residencial/canoas-rs', motivo: 'Proteção anti-robô (Cloudflare)' },
  { id: 'brandalise', nome: 'Brandalise Imóveis', site: 'https://www.brandaliseimoveis.com.br/busca/modo/alugar/cidade/Canoas/categoria/01;02;03;04/0', motivo: 'Conexão recusada para acesso automatizado' },
  { id: 'aurora', nome: 'Aurora Imóveis', site: 'https://www.auroraimoveisrs.com.br/', motivo: 'Conexão recusada para acesso automatizado' },
  { id: 'creditoreal', nome: 'Crédito Real', site: 'https://www.creditoreal.com.br/', motivo: 'Verificação de segurança (Vercel)' },
];
