// API HTTP + coleta automática periódica.
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as armazenamento from './armazenamento.js';
import { buscar, opcoesDeFiltro } from './busca.js';
import { coletaEmAndamento, coletarTudo, progressoDaColeta } from './coletor.js';
import { FONTES, FONTES_BLOQUEADAS } from './fontes/index.js';

const PORTA = Number(process.env.PORT ?? 3001);
const INTERVALO_HORAS = Number(process.env.COLETA_INTERVALO_HORAS ?? 6);

const NOMES = Object.fromEntries(FONTES.map((f) => [f.id, f.nome]));

const app = express();

app.get('/api/imoveis', (req, res) => {
  res.json(buscar(armazenamento.obter().anuncios, req.query));
});

app.get('/api/imoveis/:id', (req, res) => {
  const anuncio = armazenamento.obter().anuncios.find((a) => a.id === req.params.id);
  if (!anuncio) return res.status(404).json({ erro: 'Anúncio não encontrado' });
  res.json(anuncio);
});

app.get('/api/filtros', (req, res) => {
  res.json(opcoesDeFiltro(armazenamento.obter().anuncios, NOMES));
});

app.get('/api/fontes', (req, res) => {
  const { fontes, atualizadoEm, primeiraColetaEm } = armazenamento.obter();
  res.json({
    atualizadoEm,
    primeiraColetaEm,
    coletando: coletaEmAndamento(),
    progresso: progressoDaColeta(),
    fontes: FONTES.map((f) => ({ id: f.id, nome: f.nome, site: f.site, plataforma: f.plataforma, ...fontes?.[f.id] })),
    bloqueadas: FONTES_BLOQUEADAS,
  });
});

app.post('/api/coletar', (req, res) => {
  const jaRodando = coletaEmAndamento();
  coletarTudo().catch((erro) => console.error('Falha na coleta:', erro));
  res.status(202).json({ coletando: true, jaRodando });
});

// Em produção o servidor também entrega o front-end compilado (web/dist).
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

await armazenamento.carregar();

app.listen(PORTA, () => {
  console.log(`API em http://localhost:${PORTA}`);
});

const { atualizadoEm } = armazenamento.obter();
const desatualizado =
  !atualizadoEm || (INTERVALO_HORAS > 0 && Date.now() - Date.parse(atualizadoEm) > INTERVALO_HORAS * 3600_000);
if (desatualizado) {
  console.log('Dados ausentes ou antigos: iniciando coleta...');
  coletarTudo().catch((erro) => console.error('Falha na coleta:', erro));
}
if (INTERVALO_HORAS > 0) {
  setInterval(() => coletarTudo().catch((erro) => console.error('Falha na coleta:', erro)), INTERVALO_HORAS * 3600_000);
}
