import { useEffect, useState } from 'react';
import { inteiro, plural } from '../formatar.js';

const lista = (valor) => (valor ? valor.split(',') : []);

function Grupo({ titulo, children }) {
  return (
    <fieldset className="border-t border-linha py-4 first:border-t-0 first:pt-0">
      <legend className="mb-2 float-left w-full text-sm font-semibold">{titulo}</legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}

function Minimo({ valor, opcoes, alterar, rotulo }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={rotulo}>
      {[['', 'Todos'], ...opcoes.map((n) => [String(n), `${n}+`])].map(([v, texto]) => (
        <button
          key={v}
          type="button"
          aria-pressed={(valor ?? '') === v}
          onClick={() => alterar(v)}
          className={`opcao min-w-11 ${(valor ?? '') === v ? 'opcao-ativa' : ''}`}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

function Marcadores({ itens, selecionados, alternar, chave = (i) => i.nome, rotulo = (i) => i.nome, limite }) {
  const [todos, setTodos] = useState(false);
  const visiveis = limite && !todos ? itens.slice(0, limite) : itens;
  return (
    <>
      <ul className="space-y-1">
        {visiveis.map((item) => {
          const id = chave(item);
          return (
            <li key={id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-fundo">
                <input
                  type="checkbox"
                  checked={selecionados.includes(id)}
                  onChange={() => alternar(id)}
                  className="h-4 w-4 accent-tinta"
                />
                <span className="flex-1">{rotulo(item)}</span>
                <span className="tabular-nums text-tinta-suave">{inteiro(item.total)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {limite && itens.length > limite && (
        <button type="button" onClick={() => setTodos(!todos)} className="mt-2 text-sm font-semibold underline underline-offset-4">
          {todos ? 'Mostrar menos' : `Mostrar todos (${itens.length})`}
        </button>
      )}
    </>
  );
}

function Interruptor({ marcado, alterar, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm">
      <input type="checkbox" checked={marcado} onChange={(e) => alterar(e.target.checked)} className="h-4 w-4 accent-tinta" />
      {children}
    </label>
  );
}

function CampoNumero({ valor, alterar, placeholder, rotulo }) {
  // guarda o texto localmente e só aplica o filtro ao parar de digitar
  const [texto, setTexto] = useState(valor ?? '');
  useEffect(() => setTexto(valor ?? ''), [valor]);
  useEffect(() => {
    if (texto === (valor ?? '')) return;
    const id = setTimeout(() => alterar(texto.replace(/\D/g, '')), 400);
    return () => clearTimeout(id);
  }, [texto, valor, alterar]);
  return (
    <label className="flex-1">
      <span className="sr-only">{rotulo}</span>
      <input inputMode="numeric" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} className="campo" />
    </label>
  );
}

const TETOS = [1500, 2000, 2500, 3000, 4000];

export default function Filtros({ filtros, opcoes, alterar, limpar, totalFavoritos, aberto, fechar, totalResultados }) {
  const alternarLista = (campo) => (valor) => {
    const atual = lista(filtros[campo]);
    const novo = atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor];
    alterar({ [campo]: novo.join(',') });
  };

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, fechar]);

  const conteudo = (
    <div>
      <Grupo titulo="Aluguel por mês">
        <div className="flex items-center gap-2">
          <CampoNumero rotulo="Aluguel mínimo" valor={filtros.precoMin} alterar={(v) => alterar({ precoMin: v })} placeholder="Mínimo" />
          <span className="text-tinta-suave">a</span>
          <CampoNumero rotulo="Aluguel máximo" valor={filtros.precoMax} alterar={(v) => alterar({ precoMax: v })} placeholder="Máximo" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TETOS.map((teto) => (
            <button
              key={teto}
              type="button"
              aria-pressed={filtros.precoMax === String(teto)}
              onClick={() => alterar({ precoMax: filtros.precoMax === String(teto) ? '' : String(teto), precoMin: '' })}
              className={`opcao text-xs ${filtros.precoMax === String(teto) ? 'opcao-ativa' : ''}`}
            >
              até {inteiro(teto)}
            </button>
          ))}
        </div>
      </Grupo>

      <Grupo titulo="Quartos">
        <Minimo rotulo="Mínimo de quartos" valor={filtros.quartos} opcoes={[1, 2, 3, 4]} alterar={(v) => alterar({ quartos: v })} />
      </Grupo>

      <Grupo titulo="Vagas de garagem">
        <Minimo rotulo="Mínimo de vagas" valor={filtros.vagas} opcoes={[1, 2]} alterar={(v) => alterar({ vagas: v })} />
      </Grupo>

      <Grupo titulo="Área (m²)">
        <div className="flex items-center gap-2">
          <CampoNumero rotulo="Área mínima" valor={filtros.areaMin} alterar={(v) => alterar({ areaMin: v })} placeholder="Mínima" />
          <span className="text-tinta-suave">a</span>
          <CampoNumero rotulo="Área máxima" valor={filtros.areaMax} alterar={(v) => alterar({ areaMax: v })} placeholder="Máxima" />
        </div>
      </Grupo>

      <Grupo titulo="Bairro">
        {opcoes ? (
          <Marcadores
            itens={[...opcoes.bairros].sort((a, b) => b.total - a.total)}
            selecionados={lista(filtros.bairro)}
            alternar={alternarLista('bairro')}
            limite={8}
          />
        ) : (
          <p className="text-sm text-tinta-suave">Carregando…</p>
        )}
      </Grupo>

      {opcoes && opcoes.tipos.length > 1 && (
        <Grupo titulo="Tipo">
          <Marcadores itens={opcoes.tipos} selecionados={lista(filtros.tipo)} alternar={alternarLista('tipo')} />
        </Grupo>
      )}

      <Grupo titulo="Imobiliária">
        {opcoes && (
          <Marcadores
            itens={opcoes.imobiliarias}
            chave={(i) => i.id}
            selecionados={lista(filtros.imobiliaria)}
            alternar={alternarLista('imobiliaria')}
          />
        )}
      </Grupo>

      <Grupo titulo="Mostrar">
        <Interruptor marcado={filtros.favoritos === '1'} alterar={(v) => alterar({ favoritos: v ? '1' : '' })}>
          Só favoritos ({totalFavoritos})
        </Interruptor>
        <Interruptor marcado={filtros.semRepetidos === '1'} alterar={(v) => alterar({ semRepetidos: v ? '1' : '' })}>
          Esconder o mesmo imóvel em outra imobiliária
        </Interruptor>
        <Interruptor marcado={filtros.comPreco === '1'} alterar={(v) => alterar({ comPreco: v ? '1' : '' })}>
          Só com aluguel informado
        </Interruptor>
      </Grupo>

      <button type="button" onClick={limpar} className="mt-2 text-sm font-semibold underline underline-offset-4">
        Limpar filtros
      </button>
    </div>
  );

  return (
    <>
      <aside className="hidden w-72 shrink-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">{conteudo}</div>
      </aside>

      {aberto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Filtros">
          <button type="button" aria-label="Fechar filtros" className="absolute inset-0 bg-tinta/40" onClick={fechar} />
          <div className="absolute inset-y-0 left-0 flex w-[min(22rem,90vw)] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-linha px-4 py-3">
              <h2 className="font-semibold">Filtros</h2>
              <button type="button" onClick={fechar} className="text-sm font-semibold underline underline-offset-4">
                Fechar
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">{conteudo}</div>
            <div className="border-t border-linha p-4">
              <button type="button" onClick={fechar} className="w-full rounded-md bg-tinta py-2.5 font-semibold text-white">
                {totalResultados != null ? `Ver ${plural(totalResultados, 'apartamento')}` : 'Ver apartamentos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
