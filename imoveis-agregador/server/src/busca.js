// Filtros, ordenação e paginação dos anúncios (usados pela API).
import { semAcentos } from './lib/normalizar.js';

const lista = (valor) =>
  String(valor ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const numero = (valor) => {
  const n = Number(valor);
  return valor !== undefined && valor !== '' && Number.isFinite(n) ? n : null;
};

function dentro(valor, min, max) {
  if (min == null && max == null) return true;
  if (valor == null) return false;
  return (min == null || valor >= min) && (max == null || valor <= max);
}

const normalizarBusca = (texto) => semAcentos(texto).toLowerCase();

const ORDENACOES = {
  preco_asc: (a, b) => (a.aluguel ?? Infinity) - (b.aluguel ?? Infinity),
  preco_desc: (a, b) => (b.aluguel ?? -1) - (a.aluguel ?? -1),
  total_asc: (a, b) => (a.total ?? Infinity) - (b.total ?? Infinity),
  area_desc: (a, b) => (b.area ?? -1) - (a.area ?? -1),
  preco_m2_asc: (a, b) => precoM2(a) - precoM2(b),
  recentes: (a, b) => String(b.primeiraVezEm).localeCompare(String(a.primeiraVezEm)),
};

function precoM2(a) {
  return a.aluguel && a.area ? a.aluguel / a.area : Infinity;
}

/** Aplica os filtros da query string (?precoMax=2500&quartos=2&bairro=Centro,Igara...). */
export function filtrar(anuncios, query) {
  const q = normalizarBusca(query.q ?? '');
  const bairros = new Set(lista(query.bairro));
  const imobiliarias = new Set(lista(query.imobiliaria));
  const somenteIds = query.ids !== undefined ? new Set(lista(query.ids)) : null;
  const tipos = new Set(lista(query.tipo));
  const precoMin = numero(query.precoMin);
  const precoMax = numero(query.precoMax);
  const quartos = numero(query.quartos);
  const vagas = numero(query.vagas);
  const banheiros = numero(query.banheiros);
  const areaMin = numero(query.areaMin);
  const areaMax = numero(query.areaMax);
  const comPreco = query.comPreco === '1' || query.comPreco === 'true';
  const comFoto = query.comFoto === '1' || query.comFoto === 'true';
  const semRepetidos = query.semRepetidos === '1' || query.semRepetidos === 'true';

  const vistosRepetidos = new Set();

  return anuncios.filter((a) => {
    if (somenteIds && !somenteIds.has(a.id)) return false;
    if (bairros.size && !bairros.has(a.bairro)) return false;
    if (imobiliarias.size && !imobiliarias.has(a.imobiliaria)) return false;
    if (tipos.size && !tipos.has(a.tipo)) return false;
    if (comPreco && !a.aluguel) return false;
    if (comFoto && !a.foto) return false;
    // quem não informa o valor (ex.: aluguel "sob consulta") sai quando há filtro nele
    if (!dentro(a.aluguel, precoMin, precoMax)) return false;
    if (!dentro(a.quartos, quartos, null)) return false;
    if (!dentro(a.vagas, vagas, null)) return false;
    if (!dentro(a.banheiros, banheiros, null)) return false;
    if (!dentro(a.area, areaMin, areaMax)) return false;
    if (q) {
      const texto = normalizarBusca([a.titulo, a.bairro, a.endereco, a.descricao, a.codigo, a.imobiliariaNome].join(' '));
      if (!q.split(/\s+/).every((termo) => texto.includes(termo))) return false;
    }
    if (semRepetidos && a.tambemEm?.length) {
      // mantém só o primeiro anúncio de cada grupo de repetidos
      if (a.tambemEm.some((outro) => vistosRepetidos.has(outro.id))) return false;
      vistosRepetidos.add(a.id);
    }
    return true;
  });
}

export function buscar(anuncios, query) {
  const filtrados = filtrar(anuncios, query);
  const ordenar = ORDENACOES[query.ordem] ?? ORDENACOES.preco_asc;
  filtrados.sort(ordenar);
  const porPagina = Math.min(Math.max(numero(query.porPagina) ?? 24, 1), 100);
  const pagina = Math.max(numero(query.pagina) ?? 1, 1);
  return {
    total: filtrados.length,
    pagina,
    porPagina,
    paginas: Math.ceil(filtrados.length / porPagina),
    itens: filtrados.slice((pagina - 1) * porPagina, pagina * porPagina),
  };
}

const contar = (itens, chave) => {
  const contagem = new Map();
  for (const item of itens) {
    const valor = item[chave];
    if (valor) contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
  }
  return contagem;
};

/** Opções disponíveis para montar os filtros da tela. */
export function opcoesDeFiltro(anuncios, nomesImobiliarias) {
  const precos = anuncios.map((a) => a.aluguel).filter(Boolean);
  const porImobiliaria = contar(anuncios, 'imobiliaria');
  return {
    bairros: [...contar(anuncios, 'bairro')]
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    tipos: [...contar(anuncios, 'tipo')].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
    imobiliarias: Object.entries(nomesImobiliarias)
      .map(([id, nome]) => ({ id, nome, total: porImobiliaria.get(id) ?? 0 }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    preco: { min: precos.length ? Math.min(...precos) : 0, max: precos.length ? Math.max(...precos) : 0 },
  };
}
