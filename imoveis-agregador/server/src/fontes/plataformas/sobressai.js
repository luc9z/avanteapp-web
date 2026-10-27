// Imobiliárias com site da plataforma Sobressai (fotos.sobressai.com.br).
// O site consulta uma API GraphQL própria em /api/gql, identificada pelos
// cabeçalhos "codsite" e "dominion". Ex.: Imobiliária Gestão, Moresco.
import { buscarJson, esperar } from '../../lib/http.js';
import { montarAnuncio, slug } from '../../lib/normalizar.js';

const CAMPOS = `
  id referencia titulo descricao finalidade
  tipo { nome } bairro { nome } cidade { nome }
  dormitorios suites banheiros garagems
  preco_locacao exibir_preco_locacao
  area_privativa area_util area_total
  fotos { url_foto }
`;

export function sobressaiParaAnuncio(fonte, imovel, { site, cidadeSlug }) {
  const tipo = (imovel.tipo?.nome ?? '').replace(/\s*-\s*\d+\s*dormit.*$/i, '');
  const url = `${site}/imoveis/aluguel/${cidadeSlug}/${slug(imovel.bairro?.nome) || '-'}/-/${slug(tipo) || '-'}/${slug(imovel.referencia) || '-'}/imovel/${imovel.id}`;
  const fotos = Array.isArray(imovel.fotos) ? imovel.fotos : [imovel.fotos].filter(Boolean);
  return montarAnuncio(fonte, {
    codigo: imovel.referencia || imovel.id,
    url,
    titulo: imovel.titulo,
    tipo,
    bairro: imovel.bairro?.nome,
    cidade: imovel.cidade?.nome,
    aluguel: imovel.exibir_preco_locacao === false ? null : imovel.preco_locacao,
    quartos: imovel.dormitorios,
    suites: imovel.suites,
    banheiros: imovel.banheiros,
    vagas: imovel.garagems,
    area: imovel.area_privativa || imovel.area_util || imovel.area_total,
    foto: fotos[0]?.url_foto,
    descricao: imovel.descricao,
  });
}

export function fonteSobressai({ id, nome, site, codsite, idCidade, cidadeSlug = 'canoas' }) {
  const fonte = { id, nome, site };
  return {
    ...fonte,
    plataforma: 'Sobressai (GraphQL)',
    async coletar() {
      const anuncios = [];
      let total = Infinity;
      let vistos = 0;
      for (let pagina = 1; vistos < total && pagina <= 60; pagina++) {
        const query = `{ imoveis_busca(pagina: ${pagina}, ordenar: inclusao, ordem: desc, id_cidade: ${idCidade}, aluguel: 1) { count imoveis { ${CAMPOS} } } }`;
        const resposta = await buscarJson(`${site}/api/gql`, {
          json: { query },
          headers: {
            codsite: String(codsite),
            dominion: site,
            'x-graphql-client-name': site,
            referer: `${site}/imoveis/aluguel/${cidadeSlug}`,
          },
        });
        if (resposta.errors?.length) throw new Error(`GraphQL: ${resposta.errors[0].message}`);
        const busca = resposta.data?.imoveis_busca;
        const imoveis = busca?.imoveis ?? [];
        total = busca?.count ?? 0;
        vistos += imoveis.length;
        for (const imovel of imoveis) {
          const anuncio = sobressaiParaAnuncio(fonte, imovel, { site, cidadeSlug });
          if (anuncio) anuncios.push(anuncio);
        }
        if (!imoveis.length) break;
        await esperar(600);
      }
      return anuncios;
    },
  };
}
