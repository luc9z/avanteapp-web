// Cliente HTTP usado pelos coletores: user-agent de navegador, timeout,
// novas tentativas em falhas temporárias e pausa entre páginas.

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class ErroHttp extends Error {
  constructor(status, url) {
    super(`HTTP ${status} em ${url}`);
    this.status = status;
  }
}

// A leitura do corpo fica dentro das tentativas: sites às vezes cortam a
// conexão no meio da página (erro "terminated" do fetch).
async function requisitar(url, ler, { method = 'GET', headers = {}, body, timeoutMs = 25000, tentativas = 3 } = {}) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const resp = await fetch(url, {
        method,
        body,
        headers: {
          'user-agent': USER_AGENT,
          'accept-language': 'pt-BR,pt;q=0.9',
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!resp.ok) throw new ErroHttp(resp.status, url);
      return await ler(resp);
    } catch (erro) {
      ultimoErro = erro;
      // 4xx (exceto 429) não melhora tentando de novo
      const definitivo = erro instanceof ErroHttp && erro.status < 500 && erro.status !== 429;
      if (definitivo || tentativa === tentativas) break;
      await esperar(2000 * 2 ** (tentativa - 1));
    }
  }
  if (ultimoErro instanceof ErroHttp) throw ultimoErro;
  throw new Error(`${ultimoErro.cause?.message ?? ultimoErro.message} em ${url}`, { cause: ultimoErro });
}

export function buscarTexto(url, opcoes) {
  return requisitar(url, (resp) => resp.text(), { ...opcoes, headers: { accept: 'text/html,*/*', ...opcoes?.headers } });
}

export function buscarJson(url, opcoes = {}) {
  const { json, ...resto } = opcoes;
  return requisitar(url, (resp) => resp.json(), {
    ...resto,
    method: json !== undefined ? 'POST' : resto.method,
    body: json !== undefined ? JSON.stringify(json) : resto.body,
    headers: {
      accept: 'application/json',
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...resto.headers,
    },
  });
}
