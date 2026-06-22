/**
 * LegalLayout — moldura comum para Termos de Uso e Política de Privacidade.
 * Páginas públicas (não exigem login).
 */
import { useNavigate } from 'react-router-dom'

export default function LegalLayout({ title, updatedAt, children }) {
  const navigate = useNavigate()
  return (
    <div className="page-container pb-10">
      <div className="topbar">
        <button onClick={() => navigate(-1)} className="text-primary" aria-label="Voltar">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="page-title">{title}</h1>
        <div className="w-6" />
      </div>

      <div className="px-5 py-6 max-w-2xl mx-auto">
        <p className="text-muted mb-6">Última atualização: {updatedAt}</p>
        <div className="legal-content flex flex-col gap-5 text-sm text-gray-700 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  )
}

/* Helpers de seção para manter a tipografia padronizada */
export function LegalSection({ n, title, children }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-bold text-gray-900">{n}. {title}</h2>
      {children}
    </section>
  )
}
