import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { buscarTexto } from '../src/lib/http.js';

test('tenta de novo quando o site corta a conexão no meio da página', async () => {
  let pedidos = 0;
  const servidor = createServer((req, res) => {
    pedidos++;
    res.writeHead(200, { 'content-type': 'text/html', 'content-length': '1000' });
    if (pedidos === 1) {
      res.write('<html>começo');
      res.destroy(); // corta no meio do corpo, como no erro "terminated"
    } else {
      res.end('x'.repeat(1000));
    }
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  try {
    const html = await buscarTexto(`http://127.0.0.1:${servidor.address().port}/`);
    assert.equal(html.length, 1000);
    assert.equal(pedidos, 2);
  } finally {
    servidor.close();
  }
});
