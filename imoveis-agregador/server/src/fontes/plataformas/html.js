// Sites sem API nem dados estruturados: os anúncios são lidos dos cards HTML
// da página de busca. Cada site tem seu próprio "leitor de card".
import * as cheerio from 'cheerio';
import { buscarTexto, esperar } from '../../lib/http.js';
import { montarAnuncio, tipoApartamento } from '../../lib/normalizar.js';

const numeroAntes = (texto, palavra) => texto.match(new RegExp(`(\\d+)\\s*${palavra}`, 'i'))?.[1] ?? null;
const precoDe = (texto) => texto.match(/R\$\s*([\d.]+(?:,\d{2})?)/)?.[1] ?? null;
const areaDe = (texto) => texto.match(/([\d.,]+)\s*m²/)?.[1] ?? null;

// .text() do cheerio cola os textos de elementos vizinhos ("5777" + "2 quartos"
// vira "57772 quartos"); aqui cada nó de texto é separado por espaço.
function textoSeparado($, el) {
  const partes = [];
  $(el)
    .find('*')
    .addBack()
    .contents()
    .each((_, no) => {
      if (no.type === 'text') partes.push(no.data);
    });
  return partes.join(' ').replace(/\s+/g, ' ');
}

/**
 * Coleta genérica por páginas: chama lerPagina(html) em cada página até
 * não aparecer nenhum código novo.
 */
export function fonteHtml({ id, nome, site, urlDaPagina, lerPagina, maxPaginas = 60 }) {
  const fonte = { id, nome, site };
  return {
    ...fonte,
    plataforma: 'HTML (cards)',
    async coletar() {
      const anuncios = [];
      const vistos = new Set();
      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const html = await buscarTexto(urlDaPagina(pagina));
        const itens = lerPagina(html, site).filter((d) => !vistos.has(d.codigo));
        if (!itens.length) break;
        for (const dados of itens) {
          vistos.add(dados.codigo);
          const anuncio = montarAnuncio(fonte, dados);
          if (anuncio) anuncios.push(anuncio);
        }
        await esperar(800);
      }
      return anuncios;
    },
  };
}

/** OPEN Imobiliária: <article><a data-ll-code="5777" href="/imoveis/apartamento-para-alugar-...">. */
export function lerCardsOpen(html, site) {
  const $ = cheerio.load(html);
  const itens = [];
  $('a[data-ll-code]').each((_, el) => {
    const a = $(el);
    const href = a.attr('href') ?? '';
    if (!/para-alugar/.test(href)) return;
    const texto = textoSeparado($, el);
    const img = a.find('img').first();
    // alt: "Apartamento 2 quartos para alugar, 98m², Centro - Canoas"
    const alt = img.attr('alt') ?? '';
    const [, localizacao = ''] = alt.match(/,\s*([^,]+)$/) ?? [];
    const [bairro, cidade] = localizacao.split(' - ');
    itens.push({
      codigo: a.attr('data-ll-code'),
      url: new URL(href, site).href,
      titulo: alt || null,
      tipo: href.split('/').pop().split('-para-alugar')[0].replace(/-/g, ' '),
      bairro,
      cidade,
      aluguel: precoDe(texto),
      quartos: numeroAntes(texto, 'quartos?'),
      vagas: numeroAntes(texto, 'vagas?'),
      area: areaDe(texto),
      foto: img.attr('src'),
    });
  });
  return itens;
}

/** Ágora Cia Imobiliária: cards Bootstrap com link /locacao/imoveis/{código}/{slug}. */
export function lerCardsAgora(html) {
  const $ = cheerio.load(html);
  const itens = [];
  $('.card').each((_, el) => {
    const card = $(el);
    const link = card.find('a[href*="/locacao/imoveis/"]').first();
    const href = link.attr('href');
    if (!href) return;
    const codigo = href.match(/\/locacao\/imoveis\/(\d+)/)?.[1];
    const texto = textoSeparado($, el);
    const titulo = card.find('.card-title').text().trim() || link.text().trim();
    const foto = card.find('img.carousel').first().attr('src') ?? card.find('img').first().attr('src');
    itens.push({
      codigo,
      url: href,
      titulo,
      // a busca já é filtrada por categorias de apartamento; o título só refina (Cobertura, Loft...)
      tipo: tipoApartamento(titulo) ? titulo : 'Apartamento',
      // o bairro aparece num selo sobre a foto, antes do "COD.:"
      bairro: card.find('span.fs-10.position-relative').first().text().trim() || null,
      cidade: 'Canoas',
      aluguel: precoDe(textoSeparado($, card.find('.card-footer'))) ?? precoDe(texto),
      quartos: numeroAntes(texto, 'Dormit[óo]rios?') ?? numeroAntes(texto, 'quartos?'),
      suites: card.find('[title$="Suítes"]').attr('title')?.match(/\d+/)?.[0],
      banheiros: numeroAntes(texto, 'Banheiros?'),
      vagas: numeroAntes(texto, 'Garage(?:m|ns)') ?? numeroAntes(texto, 'vagas?'),
      area: areaDe(texto),
      foto,
      descricao: card.find('.card-body p.card-text').last().text(),
    });
  });
  return itens;
}
