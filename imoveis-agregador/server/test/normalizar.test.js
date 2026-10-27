import assert from 'node:assert/strict';
import { test } from 'node:test';
import { montarAnuncio, normalizarBairro, paraNumero, tipoApartamento } from '../src/lib/normalizar.js';

test('paraNumero entende os formatos de preço dos sites', () => {
  assert.equal(paraNumero('R$ 2.150,50'), 2150.5);
  assert.equal(paraNumero('R$ 2.200'), 2200);
  assert.equal(paraNumero('1800'), 1800);
  assert.equal(paraNumero(1800), 1800);
  assert.equal(paraNumero('51.33'), 51.33);
  assert.equal(paraNumero('0'), null);
  assert.equal(paraNumero('Consulte'), null);
  assert.equal(paraNumero(null), null);
});

test('tipoApartamento aceita só tipos residenciais de apartamento', () => {
  assert.equal(tipoApartamento('Apartamento'), 'Apartamento');
  assert.equal(tipoApartamento('Apartamento - 2 Dormitórios'), 'Apartamento');
  assert.equal(tipoApartamento('Apartamento em Condomínio Residencial'), 'Apartamento');
  assert.equal(tipoApartamento('COBERTURA'), 'Cobertura');
  assert.equal(tipoApartamento('Kitnet'), 'Kitnet');
  assert.equal(tipoApartamento('Loft'), 'Loft');
  assert.equal(tipoApartamento('Casa em Condomínio'), null);
  assert.equal(tipoApartamento('Sala Comercial'), null);
  assert.equal(tipoApartamento('Loft comercial'), null);
  assert.equal(tipoApartamento(''), null);
});

test('normalizarBairro unifica grafias diferentes', () => {
  assert.equal(normalizarBairro('CENTRO'), 'Centro');
  assert.equal(normalizarBairro('Mal. Rondon'), 'Marechal Rondon');
  assert.equal(normalizarBairro('Sao Jose'), 'São José');
  assert.equal(normalizarBairro('NOSSA SENHORA DAS GRACAS'), 'Nossa Senhora das Graças');
  assert.equal(normalizarBairro('vila nova'), 'Vila Nova');
  assert.equal(normalizarBairro('  '), null);
});

test('montarAnuncio calcula o custo total e descarta não-apartamentos', () => {
  const fonte = { id: 'x', nome: 'Imobiliária X' };
  const anuncio = montarAnuncio(fonte, {
    codigo: 10, url: 'https://x/10', tipo: 'Apartamento', aluguel: '1.500', condominio: 300, iptu: '50', bairro: 'centro',
  });
  assert.equal(anuncio.id, 'x:10');
  assert.equal(anuncio.total, 1850);
  assert.equal(anuncio.bairro, 'Centro');
  assert.equal(anuncio.cidade, 'Canoas');
  assert.equal(montarAnuncio(fonte, { codigo: 11, url: 'https://x/11', tipo: 'Casa' }), null);
});
