// Sites que publicam os anúncios como dados estruturados schema.org
// (RealEstateListing em <script type="application/ld+json">).
// Ex.: Auxiliadora Predial.
import { buscarTexto, esperar } from '../../lib/http.js';
import { montarAnuncio } from '../../lib/normalizar.js';

export function extrairJsonLd(html) {
  const blocos = [];
  const regex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  for (const m of html.matchAll(regex)) {
    try {
      const dado = JSON.parse(m[1]);
      const itens = Array.isArray(dado) ? dado : dado['@graph'] ?? [dado];
      blocos.push(...itens);
    } catch {
      // JSON inválido: ignora o bloco
    }
  }
  return blocos;
}

function valorAmenidade(oferta, regex) {
  const item = (oferta?.amenityFeature ?? []).find((a) => regex.test(a.name ?? ''));
  return item?.value;
}

export function listingParaAnuncio(fonte, listing) {
  const oferta = [listing.offers].flat()[0] ?? {};
  const imovel = oferta.itemOffered ?? {};
  // "Apartamento - Centro - Canoas"
  const [, bairroDoNome] = String(listing.name ?? '').split(' - ');
  return montarAnuncio(fonte, {
    codigo: listing.identifier ?? listing.url?.split('/').pop(),
    url: listing.url,
    titulo: listing.name,
    tipo: imovel.accommodationCategory ?? listing.name,
    bairro: bairroDoNome,
    cidade: imovel.address?.addressLocality,
    endereco: imovel.address?.streetAddress,
    aluguel: oferta.price,
    quartos: imovel.numberOfBedrooms ?? imovel.numberOfRooms,
    banheiros: imovel.numberOfBathroomsTotal,
    vagas: valorAmenidade(imovel, /vaga|garagem/i),
    area: imovel.floorSize?.value,
    foto: listing.image?.url ?? listing.image?.contentUrl ?? listing.image,
    descricao: listing.description,
    latitude: imovel.geo?.latitude,
    longitude: imovel.geo?.longitude,
  });
}

/**
 * @param urlDaPagina (n) => URL da página n da busca de aluguel
 * @param maxAluguel descarta preços fora da realidade de aluguel (alguns sites
 *        misturam o valor de venda no mesmo campo)
 */
export function fonteJsonLd({ id, nome, site, urlDaPagina, maxPaginas = 40, maxAluguel = 40000 }) {
  const fonte = { id, nome, site };
  return {
    ...fonte,
    plataforma: 'schema.org (JSON-LD)',
    async coletar() {
      const anuncios = [];
      const vistos = new Set();
      for (let pagina = 1; pagina <= maxPaginas; pagina++) {
        const html = await buscarTexto(urlDaPagina(pagina));
        const listings = extrairJsonLd(html)
          .filter((b) => b['@type'] === 'RealEstateListing')
          .filter((l) => !vistos.has(l['@id'] ?? l.url));
        if (!listings.length) break; // página vazia ou repetida: chegou ao fim
        for (const listing of listings) {
          vistos.add(listing['@id'] ?? listing.url);
          const anuncio = listingParaAnuncio(fonte, listing);
          if (!anuncio || (anuncio.aluguel && anuncio.aluguel > maxAluguel)) continue;
          anuncios.push(anuncio);
        }
        await esperar(800);
      }
      return anuncios;
    },
  };
}
