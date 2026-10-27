import { useEffect, useRef } from 'react';
import { haQuantoTempo, plural } from '../formatar.js';

// Situação de cada imobiliária na última coleta.
export default function PainelFontes({ dados, fechar }) {
  const dialogo = useRef(null);

  useEffect(() => {
    const el = dialogo.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  return (
    <dialog
      ref={dialogo}
      onClose={fechar}
      onClick={(e) => e.target === dialogo.current && fechar()}
      className="w-[min(40rem,calc(100vw-2rem))] rounded-lg border border-linha bg-white p-0 text-tinta backdrop:bg-tinta/40"
    >
      <div className="flex items-center justify-between border-b border-linha px-5 py-4">
        <h2 className="text-lg font-semibold">Imobiliárias pesquisadas</h2>
        <button type="button" onClick={fechar} className="text-sm font-semibold underline underline-offset-4">
          Fechar
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
        <p className="mb-4 text-sm text-tinta-suave">
          {dados.coletando
            ? 'Buscando anúncios agora…'
            : `Última atualização ${haQuantoTempo(dados.atualizadoEm)}. Os anúncios são atualizados sozinhos a cada 6 horas.`}
        </p>

        <ul className="divide-y divide-linha">
          {dados.fontes.map((f) => (
            <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <div>
                <a href={f.site} target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-4 hover:underline">
                  {f.nome}
                </a>
                {f.ok === false && (
                  <p className="text-sm text-erro">
                    Falhou na última tentativa ({f.erro}).{' '}
                    {f.total > 0 ? `Mostrando ${plural(f.total, 'anúncio')} da coleta anterior.` : ''}
                  </p>
                )}
              </div>
              <span className="text-sm tabular-nums">
                {f.ok === undefined ? 'Ainda não coletada' : plural(f.total ?? 0, 'apartamento')}
              </span>
            </li>
          ))}
        </ul>

        {dados.bloqueadas.length > 0 && (
          <>
            <h3 className="mt-6 font-semibold">Consulte direto no site</h3>
            <p className="mb-2 text-sm text-tinta-suave">Estas imobiliárias de Canoas bloqueiam a leitura automática dos anúncios.</p>
            <ul className="divide-y divide-linha">
              {dados.bloqueadas.map((f) => (
                <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5">
                  <a href={f.site} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">
                    {f.nome}
                  </a>
                  <span className="text-sm text-tinta-suave">{f.motivo}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </dialog>
  );
}
