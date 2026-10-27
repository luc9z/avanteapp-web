import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import CardImovel from './components/CardImovel.jsx';
import Filtros from './components/Filtros.jsx';
import PainelFontes from './components/PainelFontes.jsx';
import Placa from './components/Placa.jsx';
import { haQuantoTempo, inteiro, plural } from './formatar.js';
import { useFavoritos } from './useFavoritos.js';

const ORDENS = [
  ['preco_asc', 'Menor aluguel'],
  ['total_asc', 'Menor custo total'],
  ['preco_m2_asc', 'Menor preço por m²'],
  ['area_desc', 'Maior área'],
  ['recentes', 'Mais recentes'],
  ['preco_desc', 'Maior aluguel'],
];

// Os filtros ficam na URL, então dá para salvar ou compartilhar uma busca.
function lerUrl() {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

function escreverUrl(filtros) {
  const params = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v !== '' && v != null));
  const texto = params.toString();
  try {
    window.history.replaceState(null, '', texto ? `?${texto}` : window.location.pathname);
  } catch {
    // páginas em iframe isolado podem recusar mudar a URL; os filtros seguem funcionando
  }
}

function useAtrasado(valor, ms) {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return atrasado;
}

export default function App() {
  const [filtros, setFiltros] = useState(lerUrl);
  const [opcoes, setOpcoes] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [fontes, setFontes] = useState(null);
  const [painelFontes, setPainelFontes] = useState(false);
  const [gavetaFiltros, setGavetaFiltros] = useState(false);
  const { favoritos, alternar } = useFavoritos();

  const alterar = useCallback((mudancas) => {
    setFiltros((atual) => ({ ...atual, pagina: '', ...mudancas }));
  }, []);

  const limpar = useCallback(() => setFiltros({ ordem: filtros.ordem ?? '' }), [filtros.ordem]);

  const buscaTexto = useAtrasado(filtros.q ?? '', 300);
  const consulta = useMemo(() => {
    const { favoritos: soFavoritos, q, ...resto } = filtros;
    const params = { ...resto, q: buscaTexto };
    // sem favoritos, "nenhum" garante lista vazia (ids vazio seria ignorado)
    if (soFavoritos === '1') params.ids = [...favoritos].join(',') || 'nenhum';
    return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  }, [filtros, buscaTexto, favoritos]);

  useEffect(() => escreverUrl(filtros), [filtros]);

  const carregarFontes = useCallback(() => api.fontes().then(setFontes).catch(() => {}), []);
  const carregarOpcoes = useCallback(() => api.filtros().then(setOpcoes).catch(() => {}), []);

  useEffect(() => {
    carregarFontes();
    carregarOpcoes();
  }, [carregarFontes, carregarOpcoes]);

  const [versaoDados, setVersaoDados] = useState(0);
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    api
      .imoveis(consulta)
      .then((r) => {
        if (!ativo) return;
        setResultado(r);
        setErro(null);
      })
      .catch((e) => ativo && setErro(e.message))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [consulta, versaoDados]);

  // Durante a coleta, acompanha o andamento e recarrega tudo ao terminar.
  const coletando = fontes?.coletando;
  useEffect(() => {
    if (!coletando) return;
    const id = setInterval(async () => {
      const novo = await api.fontes().catch(() => null);
      if (!novo) return;
      setFontes(novo);
      if (!novo.coletando) {
        carregarOpcoes();
        setVersaoDados((v) => v + 1);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [coletando, carregarOpcoes]);

  const atualizar = async () => {
    await api.coletar().catch((e) => setErro(e.message));
    carregarFontes();
  };

  const totalFiltros = ['precoMin', 'precoMax', 'quartos', 'vagas', 'areaMin', 'areaMax', 'bairro', 'imobiliaria', 'tipo', 'semRepetidos', 'comPreco', 'favoritos', 'q'].filter(
    (k) => filtros[k],
  ).length;

  const fontesComErro = fontes?.fontes.filter((f) => f.ok === false) ?? [];
  const totalImobiliarias = fontes?.fontes.length ?? 0;

  return (
    <div className="min-h-screen">
      <header className="z-30 sm:sticky sm:top-0 border-b border-linha bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Placa />
          <label className="relative order-3 w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-xl">
            <span className="sr-only">Buscar nos anúncios</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-suave">
              <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m14 14 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={filtros.q ?? ''}
              onChange={(e) => alterar({ q: e.target.value })}
              placeholder="Rua, condomínio, mobiliado, piscina…"
              className="campo pl-9"
            />
          </label>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <button type="button" onClick={() => setPainelFontes(true)} className="text-left text-tinta-suave hover:text-tinta">
              {fontes?.atualizadoEm ? (
                <>
                  {plural(totalImobiliarias, 'imobiliária')}, atualizado {haQuantoTempo(fontes.atualizadoEm)}
                  {fontesComErro.length > 0 && <span className="ml-1 font-semibold text-erro">({fontesComErro.length} com erro)</span>}
                </>
              ) : (
                'Ver imobiliárias'
              )}
            </button>
            <button
              type="button"
              onClick={atualizar}
              disabled={coletando}
              className="rounded-md bg-tinta px-3 py-2 font-semibold text-white hover:bg-tinta/90 disabled:cursor-wait disabled:opacity-70"
            >
              {coletando ? 'Atualizando…' : 'Atualizar anúncios'}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] gap-8 px-4 py-6 sm:px-6">
        <Filtros
          filtros={filtros}
          opcoes={opcoes}
          alterar={alterar}
          limpar={limpar}
          totalFavoritos={favoritos.size}
          aberto={gavetaFiltros}
          fechar={() => setGavetaFiltros(false)}
          totalResultados={resultado?.total}
        />

        <main className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-2xl leading-tight">
              <span className="tipo-placa text-4xl">{resultado ? inteiro(resultado.total) : '—'}</span>{' '}
              {resultado?.total === 1 ? 'apartamento para alugar' : 'apartamentos para alugar'} em Canoas
            </h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setGavetaFiltros(true)}
                className="opcao font-semibold lg:hidden"
              >
                Filtros{totalFiltros > 0 && ` (${totalFiltros})`}
              </button>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-tinta-suave">Ordenar por</span>
                <select
                  value={filtros.ordem ?? 'preco_asc'}
                  onChange={(e) => alterar({ ordem: e.target.value })}
                  className="campo w-auto py-1.5"
                >
                  {ORDENS.map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {erro && (
            <p role="alert" className="mb-5 rounded-md border border-erro/40 bg-erro/5 px-4 py-3 text-sm text-erro">
              Não foi possível carregar os anúncios: {erro}. Confira se o servidor está rodando (npm run dev) e tente de novo.
            </p>
          )}

          {resultado && resultado.total === 0 && !carregando && (
            <Vazio semDados={!fontes?.atualizadoEm} coletando={coletando} limpar={limpar} temFiltros={totalFiltros > 0} />
          )}

          <ul className={`grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${carregando ? 'opacity-60' : ''}`} aria-busy={carregando}>
            {resultado?.itens.map((anuncio) => (
              <li key={anuncio.id}>
                <CardImovel
                  anuncio={anuncio}
                  favorito={favoritos.has(anuncio.id)}
                  alternarFavorito={alternar}
                  primeiraColetaEm={fontes?.primeiraColetaEm}
                />
              </li>
            ))}
          </ul>

          {resultado && resultado.paginas > 1 && (
            <Paginacao pagina={resultado.pagina} paginas={resultado.paginas} irPara={(p) => {
              setFiltros((atual) => ({ ...atual, pagina: String(p) }));
              window.scrollTo({ top: 0 });
            }} />
          )}
        </main>
      </div>

      {painelFontes && fontes && <PainelFontes dados={fontes} fechar={() => setPainelFontes(false)} />}
    </div>
  );
}

function Vazio({ semDados, coletando, limpar, temFiltros }) {
  if (semDados) {
    return (
      <div className="rounded-lg border border-dashed border-linha bg-white px-6 py-12 text-center">
        <p className="text-lg font-semibold">{coletando ? 'Buscando anúncios nos sites das imobiliárias…' : 'Ainda não há anúncios coletados.'}</p>
        <p className="mt-1 text-tinta-suave">
          {coletando ? 'A primeira coleta leva cerca de um minuto.' : 'Clique em "Atualizar anúncios" para buscar nos sites das imobiliárias.'}
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-linha bg-white px-6 py-12 text-center">
      <p className="text-lg font-semibold">Nenhum apartamento com esses filtros.</p>
      {temFiltros && (
        <button type="button" onClick={limpar} className="mt-3 font-semibold underline underline-offset-4">
          Limpar filtros
        </button>
      )}
    </div>
  );
}

function Paginacao({ pagina, paginas, irPara }) {
  return (
    <nav aria-label="Páginas" className="mt-8 flex items-center justify-center gap-3 text-sm">
      <button type="button" className="opcao disabled:opacity-40" disabled={pagina <= 1} onClick={() => irPara(pagina - 1)}>
        Anterior
      </button>
      <span className="text-tinta-suave">
        Página {pagina} de {paginas}
      </span>
      <button type="button" className="opcao disabled:opacity-40" disabled={pagina >= paginas} onClick={() => irPara(pagina + 1)}>
        Próxima
      </button>
    </nav>
  );
}
