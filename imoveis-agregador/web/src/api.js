async function pedir(caminho, opcoes) {
  const resp = await fetch(`/api${caminho}`, opcoes);
  if (!resp.ok) throw new Error(`O servidor respondeu ${resp.status} em ${caminho}`);
  return resp.json();
}

export const api = {
  imoveis: (params) => pedir(`/imoveis?${new URLSearchParams(params)}`),
  filtros: () => pedir('/filtros'),
  fontes: () => pedir('/fontes'),
  coletar: () => pedir('/coletar', { method: 'POST' }),
};
