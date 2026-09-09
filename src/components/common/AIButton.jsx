/**
 * AIButton - o botão "Usar IA" do app.
 *
 * Padrão de uso: a IA **sugere**, a pessoa decide. O botão nunca grava
 * nada sozinho; ele devolve o resultado por `onResult` e quem chamou
 * mostra a sugestão para aceitar ou descartar. Isso importa aqui: um
 * orçamento errado enviado ao cliente, ou um relato clínico inventado,
 * custa caro - e a IA erra.
 *
 * Some da tela quando nenhum provedor de IA está configurado, em vez de
 * mostrar um botão que só produz erro.
 */
import { useState } from 'react'
import { askAI, askAIJSON, hasAI } from '../../services/ai'
import { showToast } from './Toast'
import Spinner from './Spinner'

const ICONE = (
  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
  </svg>
)

/**
 * @param {object} p
 * @param {string} p.mode        modo do ai.js ('orcamento' | 'descricao' | 'prontuario'…)
 * @param {() => object} p.build monta { prompt, context } no clique (dados sempre atuais)
 * @param {(r: any) => void} p.onResult  recebe o texto ou o JSON da IA
 * @param {boolean} [p.json]     true quando o modo devolve JSON
 * @param {string} [p.label]
 * @param {string} [p.title]     explicação curta ao lado do botão
 * @param {boolean} [p.disabled]
 * @param {string} [p.className]
 */
export default function AIButton({
  mode, build, onResult, json = false,
  label = 'Usar IA', title, disabled, className = '',
}) {
  const [carregando, setCarregando] = useState(false)

  if (!hasAI()) return null

  async function executar() {
    setCarregando(true)
    try {
      const { prompt, context } = build() || {}
      if (!prompt || !String(prompt).trim()) {
        showToast('Escreva alguma coisa antes de pedir ajuda à IA.', 'info')
        return
      }
      const pedir = json ? askAIJSON : askAI
      const resposta = await pedir({
        mode,
        messages: [{ role: 'user', content: String(prompt) }],
        context: context || {},
      })
      onResult(resposta)
    } catch (e) {
      console.error(`[ia:${mode}]`, e)
      showToast(e?.message || 'A IA não respondeu agora. Tente de novo.', 'error')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <button
      type="button"
      onClick={executar}
      disabled={disabled || carregando}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 text-xs font-bold
                  px-3 py-2 rounded-xl border border-primary/40 text-primary
                  transition-all duration-200 hover:-translate-y-px hover:bg-primary/5
                  active:translate-y-0 active:scale-[0.98]
                  disabled:opacity-50 disabled:cursor-not-allowed
                  disabled:hover:translate-y-0 ${className}`}
    >
      {carregando ? <Spinner size={14} /> : ICONE}
      {carregando ? 'Pensando...' : label}
    </button>
  )
}

/**
 * Faixa de sugestão da IA: mostra o que ela propôs e deixa aceitar ou
 * descartar. Existe para que nenhuma sugestão entre no formulário sem
 * alguém olhar antes.
 */
export function AISuggestion({ children, onAccept, onDiscard, acceptLabel = 'Usar sugestão' }) {
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 flex flex-col gap-2 animate-scale-in">
      <div className="flex items-center gap-1.5">
        <span className="text-primary">{ICONE}</span>
        <p className="text-[11px] font-bold text-primary uppercase tracking-wide">Sugestão da IA</p>
      </div>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
      <div className="flex gap-2">
        <button type="button" onClick={onAccept} className="btn-primary btn-sm flex-1">{acceptLabel}</button>
        <button type="button" onClick={onDiscard} className="btn-ghost btn-sm">Descartar</button>
      </div>
      <p className="text-[10px] text-gray-400 leading-snug">
        Sugestão automática. Confira antes de enviar: a responsabilidade pelo
        conteúdo continua sendo sua.
      </p>
    </div>
  )
}
