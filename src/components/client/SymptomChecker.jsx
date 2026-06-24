/**
 * SymptomChecker — triagem por IA antes do agendamento.
 * Usa Groq (já configurado no .env) para classificar urgência
 * e sugerir especialidade com base nos sintomas do pet.
 *
 * Props:
 *   open: bool
 *   vetName: string
 *   onClose(): void
 *   onProceed(triage): void   — triage = { urgency, specialty, summary, raw }
 *   onSkip(): void            — usuário escolhe pular a triagem
 */

import { useState } from 'react'

const GROQ_KEY = import.meta.env.VITE_GROQ_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

const QUESTIONS = [
  { id: 'animal',    label: 'Qual animal?',                  placeholder: 'Ex: Cachorro (Labrador, 4 anos)' },
  { id: 'symptom',   label: 'Qual o principal sintoma?',     placeholder: 'Ex: Vômito, diarreia, letargia...' },
  { id: 'duration',  label: 'Há quanto tempo?',              placeholder: 'Ex: desde ontem à noite' },
  { id: 'severity',  label: 'Como está o animal agora?',     placeholder: 'Ex: alerta e comendo / prostrado / inconsciente' },
  { id: 'history',   label: 'Histórico relevante?',          placeholder: 'Ex: sem histórico / já teve isso antes / tomou remédio X' },
]

export default function SymptomChecker({ open, vetName, onClose, onProceed, onSkip }) {
  const [answers, setAnswers] = useState({})
  const [step, setStep] = useState(0)   // 0-4 = perguntas, 5 = analisando, 6 = resultado
  const [triage, setTriage] = useState(null)
  const [error, setError] = useState('')

  function reset() {
    setAnswers({})
    setStep(0)
    setTriage(null)
    setError('')
  }

  function handleClose() { reset(); onClose() }
  function handleSkip()  { reset(); onSkip() }

  async function runAI() {
    setStep(5)
    setError('')
    const summary = QUESTIONS.map(q => `${q.label}: ${answers[q.id] || '—'}`).join('\n')
    const prompt = `Você é um assistente de triagem veterinária. Com base nas informações abaixo, responda em JSON válido com os campos:
- urgency: "imediata" | "alta" | "media" | "baixa"
- specialty: nome da especialidade veterinária mais adequada (1-3 palavras)
- summary: resumo clínico em 1 frase para o veterinário
- advice: orientação breve para o tutor enquanto aguarda (1-2 frases)

Dados do pet:
${summary}

Responda APENAS com o JSON, sem markdown, sem explicações.`

    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 300,
        }),
      })
      const data = await res.json()
      const raw = data.choices?.[0]?.message?.content || ''
      const json = JSON.parse(raw.replace(/```json?/g, '').replace(/```/g, '').trim())
      setTriage({ ...json, raw, answers })
      setStep(6)
    } catch (e) {
      setError('Não foi possível conectar à IA. Você pode pular a triagem e agendar diretamente.')
      setStep(4)
    }
  }

  if (!open) return null

  const URGENCY_COLOR = {
    imediata: 'bg-red-50 border-red-300 text-red-700',
    alta:     'bg-orange-50 border-orange-300 text-orange-700',
    media:    'bg-yellow-50 border-yellow-200 text-yellow-700',
    baixa:    'bg-green-50 border-green-200 text-green-700',
  }
  const URGENCY_LABEL = {
    imediata: '🚨 Urgente — busque atendimento imediato',
    alta:     '⚠️ Alta — atendimento nas próximas horas',
    media:    '🕐 Moderada — atendimento em 24–48h',
    baixa:    '✅ Baixa — agendamento regular',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
         onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-gray-900 text-base">Triagem Inteligente</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {step < 5 ? `Antes de agendar com ${vetName}` : step === 5 ? 'Analisando sintomas...' : 'Resultado da triagem'}
            </p>
          </div>
          <button onClick={handleClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        {step < 5 && (
          <div className="flex gap-1">
            {QUESTIONS.map((_, i) => (
              <div key={i} className={`flex-1 h-1 rounded-full transition-all ${i <= step ? 'bg-primary' : 'bg-gray-100'}`} />
            ))}
          </div>
        )}

        {/* Loading */}
        {step === 5 && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-primary animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="text-sm text-gray-500 text-center">Analisando os sintomas com IA veterinária...</p>
          </div>
        )}

        {/* Question */}
        {step < 5 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-gray-800 text-sm">
                {step + 1}. {QUESTIONS[step].label}
              </label>
              <textarea
                autoFocus
                value={answers[QUESTIONS[step].id] || ''}
                onChange={e => setAnswers(a => ({ ...a, [QUESTIONS[step].id]: e.target.value }))}
                placeholder={QUESTIONS[step].placeholder}
                className="input-field resize-none h-20"
              />
            </div>
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <div className="flex gap-2">
              {step > 0 && (
                <button type="button" onClick={() => setStep(s => s - 1)}
                  className="flex-1 btn-outline py-3 text-sm">Voltar</button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!answers[QUESTIONS[step].id]?.trim()) return
                  if (step === QUESTIONS.length - 1) runAI()
                  else setStep(s => s + 1)
                }}
                disabled={!answers[QUESTIONS[step].id]?.trim()}
                className="flex-1 btn-primary py-3 text-sm disabled:opacity-50"
              >
                {step === QUESTIONS.length - 1 ? 'Analisar com IA' : 'Próximo'}
              </button>
            </div>
            <button type="button" onClick={handleSkip}
              className="text-xs text-gray-400 hover:text-gray-600 text-center transition-colors">
              Pular triagem e agendar diretamente
            </button>
          </div>
        )}

        {/* Result */}
        {step === 6 && triage && (
          <div className="flex flex-col gap-4">
            <div className={`rounded-2xl border p-4 ${URGENCY_COLOR[triage.urgency] || 'bg-gray-50 border-gray-200 text-gray-700'}`}>
              <p className="font-bold text-sm">{URGENCY_LABEL[triage.urgency] || triage.urgency}</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Especialidade sugerida</span>
                <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">{triage.specialty}</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed"><strong>Resumo:</strong> {triage.summary}</p>
              {triage.advice && (
                <p className="text-xs text-gray-500 leading-relaxed bg-gray-50 rounded-xl p-3">{triage.advice}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { onProceed(triage); reset() }}
                className="w-full btn-primary py-3.5 text-sm"
              >
                Continuar para agendamento
              </button>
              <button onClick={handleSkip}
                className="w-full btn-outline py-3 text-sm text-gray-500">
                Agendar sem triagem
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
