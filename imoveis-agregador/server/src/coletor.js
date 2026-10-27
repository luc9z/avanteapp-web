// Roda todos os coletores, junta os resultados e salva.
import * as armazenamento from './armazenamento.js';
import { CIDADE, FONTES } from './fontes/index.js';
import { slug } from './lib/normalizar.js';

let coletaAtual = null;
let progresso = null;

export function coletaEmAndamento() {
  return coletaAtual !== null;
}

/** Imobiliárias já concluídas na coleta em andamento (null fora de coleta). */
export function progressoDaColeta() {
  return progresso;
}

/**
 * Coleta todas as fontes em paralelo. Uma fonte com erro mantém os anúncios
 * da coleta anterior, para o sistema não "esvaziar" quando um site cai.
 * Chamadas simultâneas reaproveitam a coleta em andamento.
 */
export function coletarTudo({ log = console.log } = {}) {
  coletaAtual ??= executar(log).finally(() => {
    coletaAtual = null;
    progresso = null;
  });
  return coletaAtual;
}

async function executar(log) {
  const anterior = armazenamento.obter();
  const anunciosAnteriores = anterior.anuncios;
  const primeiraVez = new Map(anunciosAnteriores.map((a) => [a.id, a.primeiraVezEm]));
  const agora = new Date().toISOString();
  const porFonte = new Map(FONTES.map((f) => [f.id, anunciosAnteriores.filter((a) => a.imobiliaria === f.id)]));
  const fontes = { ...anterior.fontes };
  progresso = { total: FONTES.length, prontas: 0 };

  // Cada imobiliária que termina já aparece na tela, sem esperar as outras.
  const publicarParcial = () => {
    armazenamento.substituir({ ...armazenamento.obter(), anuncios: [...porFonte.values()].flat(), fontes: { ...fontes } });
  };

  await Promise.all(
    FONTES.map(async (fonte) => {
      const inicio = Date.now();
      let status;
      try {
        const coletados = (await fonte.coletar()).filter((a) => slug(a.cidade) === slug(CIDADE));
        const ids = new Set();
        const lista = [];
        for (const anuncio of coletados) {
          if (ids.has(anuncio.id)) continue;
          ids.add(anuncio.id);
          lista.push({ ...anuncio, primeiraVezEm: primeiraVez.get(anuncio.id) ?? agora });
        }
        porFonte.set(fonte.id, lista);
        status = { ok: true, total: lista.length, erro: null };
        log(`✔ ${fonte.nome}: ${lista.length} apartamentos`);
      } catch (erro) {
        status = { ok: false, total: porFonte.get(fonte.id).length, erro: erro.message };
        log(`✘ ${fonte.nome}: ${erro.message}`);
      }
      fontes[fonte.id] = {
        ...status,
        duracaoMs: Date.now() - inicio,
        ultimaTentativa: agora,
        ultimoSucesso: status.ok ? agora : anterior.fontes?.[fonte.id]?.ultimoSucesso ?? null,
      };
      progresso.prontas++;
      publicarParcial();
    }),
  );

  const anuncios = [...porFonte.values()].flat();
  marcarRepetidos(anuncios);
  // anúncios da primeira coleta não contam como "novos"
  const estado = { anuncios, fontes, atualizadoEm: agora, primeiraColetaEm: anterior.primeiraColetaEm ?? agora };
  await armazenamento.salvar(estado);
  log(`Total: ${anuncios.length} apartamentos de ${FONTES.length} imobiliárias`);
  return estado;
}

/**
 * O mesmo apartamento costuma ser anunciado por mais de uma imobiliária.
 * Anúncios com mesmo bairro, quartos, área e aluguel de imobiliárias
 * diferentes ganham "tambemEm" apontando uns para os outros.
 */
export function marcarRepetidos(anuncios) {
  const grupos = new Map();
  for (const a of anuncios) {
    delete a.tambemEm;
    if (!a.bairro || !a.area || !a.aluguel) continue;
    const chave = [a.bairro, a.quartos ?? '', Math.round(a.area), Math.round(a.aluguel)].join('|');
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(a);
  }
  for (const grupo of grupos.values()) {
    if (new Set(grupo.map((a) => a.imobiliaria)).size < 2) continue;
    for (const a of grupo) {
      a.tambemEm = grupo
        .filter((outro) => outro.imobiliaria !== a.imobiliaria)
        .map((outro) => ({ id: outro.id, imobiliariaNome: outro.imobiliariaNome, url: outro.url }));
    }
  }
}
