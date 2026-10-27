import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buscar, filtrar, opcoesDeFiltro } from '../src/busca.js';
import { marcarRepetidos } from '../src/coletor.js';

const anuncios = [
  { id: 'a:1', imobiliaria: 'a', imobiliariaNome: 'A', titulo: 'Apto mobiliado', tipo: 'Apartamento', bairro: 'Centro', aluguel: 1500, quartos: 1, vagas: 1, area: 40, foto: 'f' },
  { id: 'a:2', imobiliaria: 'a', imobiliariaNome: 'A', titulo: 'Cobertura', tipo: 'Cobertura', bairro: 'Igara', aluguel: 4000, quartos: 3, vagas: 2, area: 150 },
  { id: 'b:1', imobiliaria: 'b', imobiliariaNome: 'B', titulo: 'Apartamento 2 dormitórios', tipo: 'Apartamento', bairro: 'Centro', aluguel: 2200, quartos: 2, vagas: 0, area: 60 },
  { id: 'b:2', imobiliaria: 'b', imobiliariaNome: 'B', titulo: 'Sob consulta', tipo: 'Apartamento', bairro: 'São José', aluguel: null, quartos: 2, area: 55 },
];

const ids = (lista) => lista.map((a) => a.id);

test('filtra por preço, quartos, bairro e imobiliária', () => {
  assert.deepEqual(ids(filtrar(anuncios, { precoMax: '2500' })), ['a:1', 'b:1']);
  assert.deepEqual(ids(filtrar(anuncios, { quartos: '2' })), ['a:2', 'b:1', 'b:2']);
  assert.deepEqual(ids(filtrar(anuncios, { bairro: 'Centro,Igara' })), ['a:1', 'a:2', 'b:1']);
  assert.deepEqual(ids(filtrar(anuncios, { imobiliaria: 'b', comPreco: '1' })), ['b:1']);
  assert.deepEqual(ids(filtrar(anuncios, { vagas: '1', areaMin: '50' })), ['a:2']);
  assert.deepEqual(ids(filtrar(anuncios, { tipo: 'Cobertura' })), ['a:2']);
});

test('busca por texto ignora acentos e maiúsculas', () => {
  assert.deepEqual(ids(filtrar(anuncios, { q: 'DORMITORIOS centro' })), ['b:1']);
  assert.deepEqual(ids(filtrar(anuncios, { q: 'sao jose' })), ['b:2']);
});

test('ordena e pagina; sem preço vai para o fim', () => {
  const r = buscar(anuncios, { ordem: 'preco_asc', porPagina: '3' });
  assert.equal(r.total, 4);
  assert.equal(r.paginas, 2);
  assert.deepEqual(ids(r.itens), ['a:1', 'b:1', 'a:2']);
  assert.deepEqual(ids(buscar(anuncios, { ordem: 'preco_asc', porPagina: '3', pagina: '2' }).itens), ['b:2']);
  assert.deepEqual(ids(buscar(anuncios, { ordem: 'area_desc' }).itens), ['a:2', 'b:1', 'b:2', 'a:1']);
});

test('opções de filtro contam bairros e imobiliárias', () => {
  const opcoes = opcoesDeFiltro(anuncios, { a: 'A', b: 'B', c: 'C' });
  assert.deepEqual(opcoes.bairros, [
    { nome: 'Centro', total: 2 },
    { nome: 'Igara', total: 1 },
    { nome: 'São José', total: 1 },
  ]);
  assert.deepEqual(opcoes.imobiliarias.map((i) => i.total), [2, 2, 0]);
  assert.deepEqual(opcoes.preco, { min: 1500, max: 4000 });
});

test('marca o mesmo apartamento anunciado por imobiliárias diferentes', () => {
  const lista = [
    { id: 'a:9', imobiliaria: 'a', imobiliariaNome: 'A', url: 'u1', bairro: 'Centro', quartos: 2, area: 60.2, aluguel: 2000 },
    { id: 'b:9', imobiliaria: 'b', imobiliariaNome: 'B', url: 'u2', bairro: 'Centro', quartos: 2, area: 60, aluguel: 2000 },
    { id: 'b:8', imobiliaria: 'b', imobiliariaNome: 'B', url: 'u3', bairro: 'Centro', quartos: 2, area: 60, aluguel: 2100 },
  ];
  marcarRepetidos(lista);
  assert.deepEqual(lista[0].tambemEm, [{ id: 'b:9', imobiliariaNome: 'B', url: 'u2' }]);
  assert.deepEqual(lista[1].tambemEm, [{ id: 'a:9', imobiliariaNome: 'A', url: 'u1' }]);
  assert.equal(lista[2].tambemEm, undefined);
  assert.deepEqual(ids(filtrar(lista, { semRepetidos: '1' })), ['a:9', 'b:8']);
});
