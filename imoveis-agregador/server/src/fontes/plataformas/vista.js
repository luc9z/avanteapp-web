// Imobiliárias que usam o CRM Vista (vistahost.com.br). Os sites expõem os
// imóveis com os mesmos nomes de campo (Codigo, ValorLocacao, Categoria...),
// seja por uma API JSON (Prime Class) ou embutidos no HTML (Gallina, Lottici).
import { buscarJson, buscarTexto, esperar } from '../../lib/http.js';
import { montarAnuncio, slug } from '../../lib/normalizar.js';

export function vistaParaAnuncio(fonte, imovel, url) {
  const endereco = [imovel.TipoEndereco, imovel.Endereco].filter(Boolean).join(' ');
  return montarAnuncio(fonte, {
    codigo: imovel.Codigo,
    url,
    titulo: imovel.TituloSite,
    tipo: imovel.Categoria,
    bairro: imovel.BairroComercial || imovel.Bairro,
    cidade: imovel.Cidade,
    endereco,
    aluguel: imovel.ValorLocacao,
    condominio: imovel.ValorCondominio,
    iptu: imovel.ValorIptu,
    quartos: imovel.Dormitorios,
    suites: imovel.Suites,
    banheiros: imovel.TotalBanheiros || imovel.BanheiroSocialQtd,
    vagas: imovel.Vagas,
    area: imovel.AreaPrivativa || imovel.AreaTotal,
    foto: imovel.FotoDestaque || imovel.FotoDestaquePequena,
    descricao: imovel.DescricaoWebResumo || imovel.DescricaoWeb,
    latitude: imovel.Latitude,
    longitude: imovel.Longitude,
  });
}

const ehAluguel = (status) => /alug|loca/i.test(status ?? '');

/**
 * Sites Vista com a rota /api-external/imoveis/listar (proxy da API Vista).
 * Ex.: Prime Class.
 */
export function fonteVistaApi({ id, nome, site, cidade = 'Canoas' }) {
  const fonte = { id, nome, site };
  return {
    ...fonte,
    plataforma: 'Vista (API)',
    async coletar() {
      const anuncios = [];
      for (let pagina = 1; pagina <= 20; pagina++) {
        const resposta = await buscarJson(`${site}/api-external/imoveis/listar`, {
          headers: { referer: `${site}/busca` },
          json: {
            fields: [
              'Codigo', 'ValorLocacao', 'Categoria', 'Cidade', 'Bairro', 'Status', 'Dormitorios',
              'Vagas', 'Suites', 'TotalBanheiros', 'AreaPrivativa', 'AreaTotal', 'FotoDestaque',
              'TituloSite', 'TipoEndereco', 'Endereco', 'ValorCondominio', 'ValorIptu',
            ],
            filter: {
              ExibirNoSite: ['Sim'],
              Cidade: [cidade],
              Status: ['Aluguel', 'Venda e Aluguel'],
              Categoria: ['Apartamento', 'Cobertura', 'Loft', 'Kitnet', 'Studio', 'Flat'],
            },
            paginacao: { pagina, quantidade: 50 },
            order: { DataAtualizacao: 'desc' },
          },
        });
        const imoveis = Object.entries(resposta)
          .filter(([chave]) => chave.startsWith('__ordem_') || /^\d+$/.test(chave))
          .map(([, imovel]) => imovel);
        for (const imovel of imoveis) {
          if (!ehAluguel(imovel.Status)) continue;
          const url = `${site}/imovel/${slug(imovel.Categoria)}/${imovel.Codigo}`;
          const anuncio = vistaParaAnuncio(fonte, imovel, url);
          if (anuncio) anuncios.push(anuncio);
        }
        if (!imoveis.length || pagina >= Number(resposta.paginas ?? 1)) break;
        await esperar(800);
      }
      return anuncios;
    },
  };
}

/**
 * Extrai os objetos {"Codigo": ...} que o Next.js embute no HTML
 * (self.__next_f.push) das páginas de busca.
 */
export function extrairImoveisVistaDoHtml(html) {
  let payload = '';
  const regex = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  for (const m of html.matchAll(regex)) {
    try {
      payload += JSON.parse(`"${m[1]}"`);
    } catch {
      // trecho malformado: ignora
    }
  }
  const imoveis = [];
  let inicio = 0;
  while ((inicio = payload.indexOf('{"Codigo":', inicio)) >= 0) {
    const fim = fimDoObjeto(payload, inicio);
    if (fim < 0) break;
    try {
      imoveis.push(JSON.parse(payload.slice(inicio, fim + 1)));
    } catch {
      // objeto com referências do React (ex.: "$undefined" fora de string): ignora
    }
    inicio = fim + 1;
  }
  return imoveis;
}

function fimDoObjeto(texto, inicio) {
  let profundidade = 0;
  let emString = false;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (emString) {
      if (c === '\\') i++;
      else if (c === '"') emString = false;
    } else if (c === '"') emString = true;
    else if (c === '{') profundidade++;
    else if (c === '}' && --profundidade === 0) return i;
  }
  return -1;
}

/**
 * Sites Vista feitos em Next.js com busca em /busca?finalidade=Aluguel&tipo=...
 * (Gallina, Lottici).
 */
export function fonteVistaSite({ id, nome, site, tipos = ['Apartamento', 'Cobertura', 'Loft', 'Kitnet', 'Studio'] }) {
  const fonte = { id, nome, site };
  return {
    ...fonte,
    plataforma: 'Vista (site)',
    async coletar() {
      const anuncios = [];
      const vistos = new Set();
      for (const tipo of tipos) {
        for (let pagina = 1; pagina <= 30; pagina++) {
          const url = `${site}/busca?finalidade=Aluguel&tipo=${encodeURIComponent(tipo)}&page=${pagina}`;
          const html = await buscarTexto(url);
          const links = [...html.matchAll(/href="(\/imovel\/[^"?#]+)"/g)].map((m) => m[1]);
          let novos = 0;
          for (const imovel of extrairImoveisVistaDoHtml(html)) {
            if (vistos.has(imovel.Codigo)) continue;
            const link = links.find((l) => l.toLowerCase().endsWith(`-${String(imovel.Codigo).toLowerCase()}`));
            if (!link) continue; // objeto que não é card da busca (ex.: destaque do rodapé)
            vistos.add(imovel.Codigo);
            novos++;
            if (!ehAluguel(imovel.Status) && !imovel.FinalidadeStatus?.ALUGUEL) continue;
            const anuncio = vistaParaAnuncio(fonte, imovel, site + link);
            if (anuncio) anuncios.push(anuncio);
          }
          if (!novos) break;
          await esperar(800);
        }
      }
      return anuncios;
    },
  };
}
