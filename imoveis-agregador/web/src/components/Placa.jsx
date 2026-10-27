// A marca do app: a plaquinha amarela de "ALUGA" pendurada nos prédios.
export default function Placa() {
  return (
    <a href="/" className="group flex items-end gap-2" aria-label="Aluga Canoas, início">
      <span className="relative inline-flex flex-col items-center">
        <svg aria-hidden="true" viewBox="0 0 64 10" className="h-2.5 w-16 text-tinta">
          <path d="M8 10 22 1h20l14 9" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="32" cy="1.5" r="1.5" fill="currentColor" />
        </svg>
        <span className="tipo-placa -mt-px rounded-[3px] border-2 border-tinta bg-placa px-2 pb-0.5 pt-1 text-xl leading-none tracking-wide transition-transform group-hover:-rotate-2">
          ALUGA
        </span>
      </span>
      <span className="pb-0.5 text-lg font-semibold leading-none" style={{ fontVariationSettings: "'wdth' 90" }}>
        Canoas
      </span>
    </a>
  );
}
