// Funções que transformam os dados de cada site num formato único.

export function semAcentos(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function slug(texto) {
  return semAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function limparTexto(texto) {
  if (texto == null) return null;
  const limpo = String(texto).replace(/\s+/g, ' ').trim();
  return limpo && limpo !== '$undefined' ? limpo : null;
}

/** "R$ 2.150,50" → 2150.5 · 1800 → 1800 · "1800" → 1800 · inválido/zero → null */
export function paraNumero(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) && valor > 0 ? valor : null;
  let s = String(valor).replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function paraInteiro(valor) {
  if (valor == null || valor === '') return null;
  const n = parseInt(String(valor).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

// Tipos de imóvel considerados "apartamento" e o nome padronizado de cada um.
const TIPOS_APARTAMENTO = [
  [/cobertura/, 'Cobertura'],
  [/\bloft\b/, 'Loft'],
  [/studio|estudio/, 'Studio'],
  [/kitnet|kitinete|kit net|quitinete|\bjk\b/, 'Kitnet'],
  [/\bflat\b/, 'Flat'],
  [/garden/, 'Apartamento Garden'],
  [/duplex|triplex/, 'Apartamento Duplex'],
  [/apart|\bapto\b/, 'Apartamento'],
];

// "Loft comercial", "Sala comercial em edifício"... não são moradia
const NAO_RESIDENCIAL = /comercial|\bloja\b|\bsala\b|corporativ/;

/** Devolve o tipo padronizado se for apartamento (ou similar), senão null. */
export function tipoApartamento(tipo) {
  const t = semAcentos(tipo).toLowerCase();
  if (!t || NAO_RESIDENCIAL.test(t)) return null;
  for (const [regex, nome] of TIPOS_APARTAMENTO) {
    if (regex.test(t)) return nome;
  }
  return null;
}

// Bairros de Canoas com a grafia correta, para unificar "CENTRO", "Mal. Rondon", "Sao Jose"...
const BAIRROS_CANOAS = [
  'Bela Vista', 'Brigadeira', 'Centro', 'Estância Velha', 'Fátima', 'Guajuviras', 'Harmonia',
  'Igara', 'Industrial', 'Marechal Rondon', 'Mathias Velho', 'Mato Grande', 'Moinhos de Vento',
  'Mont Serrat', 'Niterói', 'Nossa Senhora das Graças', 'Olaria', 'Rio Branco', 'São José',
  'São Luís', 'São Vicente', 'Igara III', 'Ilha das Graças',
];
const BAIRRO_POR_SLUG = new Map(BAIRROS_CANOAS.map((b) => [slug(b), b]));
const APELIDOS_BAIRRO = new Map([
  ['mal-rondon', 'Marechal Rondon'],
  ['mal-randon', 'Marechal Rondon'],
  ['marechal-randon', 'Marechal Rondon'],
  ['n-sra-das-gracas', 'Nossa Senhora das Graças'],
  ['nsa-sra-das-gracas', 'Nossa Senhora das Graças'],
  ['nossa-sra-das-gracas', 'Nossa Senhora das Graças'],
  ['n-s-das-gracas', 'Nossa Senhora das Graças'],
  ['matias-velho', 'Mathias Velho'],
  ['sao-luis', 'São Luís'],
  ['sao-luiz', 'São Luís'],
  ['estancia-velha', 'Estância Velha'],
  ['montserrat', 'Mont Serrat'],
]);

const MINUSCULAS = new Set(['de', 'da', 'das', 'do', 'dos', 'e']);

function capitalizar(texto) {
  return texto
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

export function normalizarBairro(bairro) {
  const limpo = limparTexto(bairro);
  if (!limpo) return null;
  const s = slug(limpo);
  return BAIRRO_POR_SLUG.get(s) ?? APELIDOS_BAIRRO.get(s) ?? capitalizar(limpo);
}

export function normalizarCidade(cidade) {
  const limpo = limparTexto(cidade);
  return limpo ? capitalizar(limpo) : null;
}

/**
 * Monta o anúncio no formato padrão. Campos ausentes viram null.
 * Retorna null se não for apartamento ou não tiver URL/código.
 */
export function montarAnuncio(fonte, dados) {
  const tipo = tipoApartamento(dados.tipo);
  if (!tipo || !dados.url || dados.codigo == null) return null;
  const aluguel = paraNumero(dados.aluguel);
  const condominio = paraNumero(dados.condominio);
  const iptu = paraNumero(dados.iptu);
  return {
    id: `${fonte.id}:${dados.codigo}`,
    imobiliaria: fonte.id,
    imobiliariaNome: fonte.nome,
    codigo: String(dados.codigo),
    url: dados.url,
    titulo: limparTexto(dados.titulo) ?? `${tipo} para alugar`,
    tipo,
    bairro: normalizarBairro(dados.bairro),
    cidade: normalizarCidade(dados.cidade) ?? 'Canoas',
    endereco: limparTexto(dados.endereco),
    aluguel,
    condominio,
    iptu,
    total: aluguel ? aluguel + (condominio ?? 0) + (iptu ?? 0) : null,
    quartos: paraInteiro(dados.quartos),
    suites: paraInteiro(dados.suites),
    banheiros: paraInteiro(dados.banheiros),
    vagas: paraInteiro(dados.vagas),
    area: paraNumero(dados.area),
    foto: dados.foto || null,
    descricao: limparTexto(dados.descricao)?.slice(0, 600) ?? null,
    latitude: paraCoordenada(dados.latitude),
    longitude: paraCoordenada(dados.longitude),
  };
}

function paraCoordenada(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n !== 0 ? n : null;
}
