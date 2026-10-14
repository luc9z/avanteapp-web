/**
 * TelaEntrada - moldura das telas de entrar e criar conta.
 *
 * No celular é a coluna de sempre. No computador o formulário sozinho
 * virava uma faixa estreita no meio de um monitor vazio; a partir de lg
 * a tela se divide: a marca e o que o app faz à esquerda, o formulário
 * à direita, centralizado no espaço dele.
 */
import AvanteLogo from './AvanteLogo'

const PONTOS = [
  'Tutores e produtores pedem atendimento perto de casa ou da propriedade',
  'O veterinário recebe os pedidos da região e decide quais aceitar',
  'Agenda, orçamento e prontuário no mesmo lugar',
]

export default function TelaEntrada({ children, className = '' }) {
  return (
    <div className="tela-entrada">
      <aside className="tela-entrada-marca" aria-hidden="true">
        <AvanteLogo className="tela-entrada-fundo" />
        <AvanteLogo variant="horizontal" className="h-20 text-brand-creme self-start" />
        <div className="flex flex-col gap-6 max-w-md">
          <p className="text-3xl xl:text-4xl font-bold leading-tight text-brand-creme">
            Atendimento veterinário a domicílio, na cidade e no campo.
          </p>
          <ul className="flex flex-col gap-3">
            {PONTOS.map(p => (
              <li key={p} className="flex items-start gap-3 text-base text-brand-creme/80">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0 text-brand-salvia" fill="none" stroke="currentColor"
                  strokeWidth={2.4} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-brand-creme/50">avante.vet.br</p>
      </aside>

      <main className={`tela-entrada-form ${className}`}>{children}</main>
    </div>
  )
}
