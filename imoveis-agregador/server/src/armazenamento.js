// Guarda os anúncios num arquivo JSON (data/imoveis.json). São poucas
// centenas de anúncios, então tudo cabe em memória e dispensa banco de dados.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = process.env.PASTA_DADOS ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ARQUIVO = path.join(PASTA, 'imoveis.json');

/** @type {{ anuncios: object[], fontes: Record<string, object>, atualizadoEm: string | null, primeiraColetaEm?: string }} */
let estado = { anuncios: [], fontes: {}, atualizadoEm: null };

export async function carregar() {
  try {
    estado = JSON.parse(await readFile(ARQUIVO, 'utf8'));
  } catch (erro) {
    if (erro.code !== 'ENOENT') console.warn(`Não foi possível ler ${ARQUIVO}:`, erro.message);
  }
  return estado;
}

export function obter() {
  return estado;
}

export async function salvar(novoEstado) {
  estado = novoEstado;
  await mkdir(PASTA, { recursive: true });
  const temporario = `${ARQUIVO}.tmp`;
  await writeFile(temporario, JSON.stringify(estado));
  await rename(temporario, ARQUIVO);
}
