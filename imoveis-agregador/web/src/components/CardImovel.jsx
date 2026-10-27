import { useState } from 'react';
import { ehNovo, inteiro, plural, reais } from '../formatar.js';

function Caracteristicas({ anuncio }) {
  const itens = [
    anuncio.quartos != null && plural(anuncio.quartos, 'quarto'),
    anuncio.suites > 0 && plural(anuncio.suites, 'suíte'),
    anuncio.vagas != null && (anuncio.vagas === 0 ? 'sem vaga' : plural(anuncio.vagas, 'vaga')),
    anuncio.area && `${inteiro(anuncio.area)} m²`,
  ].filter(Boolean);
  if (!itens.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-tinta">
      {itens.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function CardImovel({ anuncio, favorito, alternarFavorito, primeiraColetaEm }) {
  const [semFoto, setSemFoto] = useState(!anuncio.foto);
  const extras = anuncio.total && anuncio.total > anuncio.aluguel ? anuncio.total - anuncio.aluguel : 0;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-linha bg-white hover:border-tinta/50 has-[h2_a:focus-visible]:ring-[3px] has-[h2_a:focus-visible]:ring-tinta">
      <div className="relative aspect-[4/3] bg-fundo">
        {semFoto ? (
          <div className="flex h-full items-center justify-center text-sm text-tinta-suave">Sem foto</div>
        ) : (
          <img
            src={anuncio.foto}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setSemFoto(true)}
            className="h-full w-full object-cover"
          />
        )}
        {ehNovo(anuncio, primeiraColetaEm) && (
          <span className="absolute left-3 top-3 rounded bg-white px-2 py-0.5 text-xs font-semibold text-ok shadow-sm">Novo</span>
        )}
        <button
          type="button"
          onClick={() => alternarFavorito(anuncio.id)}
          aria-pressed={favorito}
          aria-label={favorito ? 'Tirar dos favoritos' : 'Salvar nos favoritos'}
          className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-2 text-tinta shadow-sm hover:bg-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"
              fill={favorito ? '#B9382C' : 'none'}
              stroke={favorito ? '#B9382C' : 'currentColor'}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {/* a etiqueta de preço imita a placa "ALUGA" */}
        <div className="absolute -bottom-4 left-3 rounded-[3px] border-2 border-tinta bg-placa px-2.5 py-1 shadow-[2px_2px_0_#1F2A36]">
          {anuncio.aluguel ? (
            <span className="tipo-placa text-2xl leading-none">
              {reais(anuncio.aluguel)}
              <span className="ml-0.5 text-sm font-semibold">/mês</span>
            </span>
          ) : (
            <span className="tipo-placa text-lg leading-none">Aluguel a consultar</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-7">
        {extras > 0 && (
          <p className="text-sm text-tinta-suave">
            {reais(anuncio.total)} com {anuncio.condominio && anuncio.iptu ? 'condomínio e IPTU' : anuncio.condominio ? 'condomínio' : 'IPTU'}
          </p>
        )}
        <h2 className="font-semibold leading-snug">
          <a
            href={anuncio.url}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {anuncio.titulo}
          </a>
        </h2>
        <p className="text-sm text-tinta-suave">
          {[anuncio.tipo !== 'Apartamento' && anuncio.tipo, anuncio.bairro ?? 'Bairro não informado', anuncio.endereco]
            .filter(Boolean)
            .join(', ')}
        </p>
        <Caracteristicas anuncio={anuncio} />

        <footer className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-linha pt-3 text-sm">
          <span>
            <span className="text-tinta-suave">Anunciado por </span>
            <span className="font-semibold">{anuncio.imobiliariaNome}</span>
          </span>
          <span className="text-tinta-suave">Cód. {anuncio.codigo}</span>
          {anuncio.tambemEm?.length > 0 && (
            <p className="relative z-10 w-full text-tinta-suave">
              Também anunciado por{' '}
              {anuncio.tambemEm.map((outro, i) => (
                <span key={outro.id}>
                  {i > 0 && ', '}
                  <a href={outro.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-tinta underline underline-offset-2">
                    {outro.imobiliariaNome}
                  </a>
                </span>
              ))}
            </p>
          )}
        </footer>
      </div>
    </article>
  );
}
