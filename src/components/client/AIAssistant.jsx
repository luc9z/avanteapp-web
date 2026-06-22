import { useState, useRef, useEffect, useCallback } from 'react'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../../firebase'
import Spinner from '../common/Spinner'

/* ── specialty keyword map ───────────────────────────────────── */
const SPECIALTY_KEYWORDS = {
  'Pequenos animais': ['gato', 'gata', 'cachorro', 'cão', 'cadela', 'felino', 'canino', 'hamster', 'coelho', 'porquinho', 'pet', 'filhote'],
  'Bovinos':          ['vaca', 'boi', 'bezerro', 'bovino', 'gado', 'novilho'],
  'Equinos':          ['cavalo', 'égua', 'potro', 'equino', 'pônei', 'mula'],
  'Aves':             ['ave', 'pássaro', 'papagaio', 'calopsita', 'galinha', 'periquito', 'canário'],
  'Exóticos':         ['réptil', 'cobra', 'lagarto', 'iguana', 'tartaruga', 'exótico', 'serpente'],
  'Cirurgia':         ['cirurgia', 'operar', 'operação', 'corte', 'ferida', 'fratura', 'osso quebrado'],
  'Dermatologia':     ['pele', 'coceira', 'alergia', 'dermatite', 'pelo', 'caspa', 'mancha'],
  'Oftalmologia':     ['olho', 'olhos', 'visão', 'catarata', 'secreção ocular'],
}

function isFeatured(v) {
  return v.featured === true || v.plan === 'premium' || v.plan === 'destaque' || v.plan === 'pro'
}

function matchSpecialties(text) {
  const t = text.toLowerCase()
  return Object.entries(SPECIALTY_KEYWORDS)
    .filter(([, kws]) => kws.some(k => t.includes(k)))
    .map(([s]) => s)
}

function vetMatchesSpecialties(vet, specs) {
  if (specs.length === 0) return true
  const vetSpecs = Array.isArray(vet.specialties)
    ? vet.specialties
    : vet.specialty ? [vet.specialty] : []
  return specs.some(s => vetSpecs.some(vs => vs.toLowerCase().includes(s.toLowerCase())))
}

function rankVets(vets, userText) {
  const specs = matchSpecialties(userText)
  const matching = vets.filter(v => vetMatchesSpecialties(v, specs))
  const fallback = matching.length === 0 ? vets : matching

  return [...fallback].sort((a, b) => {
    const fa = isFeatured(a) ? 1 : 0
    const fb = isFeatured(b) ? 1 : 0
    if (fa !== fb) return fb - fa
    const oa = a.is_online ? 1 : 0
    const ob = b.is_online ? 1 : 0
    if (oa !== ob) return ob - oa
    return Number(b.averageRating || 0) - Number(a.averageRating || 0)
  }).slice(0, 4)
}

/* ── system prompt ───────────────────────────────────────────── */
function buildPrompt(vets) {
  const vetList = vets.length > 0
    ? `\n\nVeterinários disponíveis:\n${vets.map(v => {
        const specs = Array.isArray(v.specialties) ? v.specialties.join(', ') : (v.specialty || 'Clínico geral')
        const badge = isFeatured(v) ? ' ⭐ Destaque' : ''
        const online = v.is_online ? ' 🟢' : ''
        return `- ${v.name}${badge}${online} — ${specs}`
      }).join('\n')}`
    : ''

  return `Você é a triagem do AvanteApp (veterinária a domicílio, Brasil).

REGRAS:
- Máx 2-3 frases curtas. Direto e prático.
- Dúvidas gerais (vacinas, alimentação, comportamento, rotina): responda direto, SEM sugerir agendamento.
- Sintomas físicos agudos, dor, ferida, emergência, piora repentina, ou pedido de agendamento: oriente e inclua [SUGGEST_BOOKING] no fim.
- Se incluir [SUGGEST_BOOKING]: mencione o veterinário mais adequado pelo nome.
- PROIBIDO: "é fundamental que", "é importante que", discursos longos.
- Exemplos:
  Pergunta "quando vacinar meu cavalo?" → responda o calendário vacinal, sem [SUGGEST_BOOKING].
  Pergunta "meu cão está vomitando sangue" → oriente + [SUGGEST_BOOKING].
- Responda em português informal.${vetList}`
}

const INITIAL_MSG = {
  role: 'assistant',
  content: 'O que está acontecendo com seu pet?',
  isInitial: true,
}

const QUICK_OPTIONS = [
  { label: '🤒 Está doente', text: 'Meu pet está doente' },
  { label: '🩸 Ferida / machucado', text: 'Meu pet está machucado' },
  { label: '💊 Dúvida sobre medicação', text: 'Tenho dúvida sobre medicação' },
  { label: '📅 Quero agendar', text: 'Quero agendar uma consulta' },
]

/* ── Persistência local da conversa (economiza tokens) ──────────
   - Conversa fica salva por 30 min: reabrir o assistente não perde
     o histórico nem refaz chamadas à IA.
   - Cache de respostas: a MESMA pergunta feita em até 2 min reusa a
     resposta anterior, sem nova chamada (sem gastar tokens).        */
const CHAT_KEY = 'avante-ai-chat'
const CACHE_KEY = 'avante-ai-cache'
const CHAT_TTL = 30 * 60 * 1000   // 30 min
const CACHE_TTL = 120 * 1000      // 2 min

function loadMessages() {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAT_KEY) || 'null')
    if (raw && Date.now() - raw.ts < CHAT_TTL && Array.isArray(raw.messages) && raw.messages.length > 0) {
      return raw.messages
    }
  } catch {}
  return [INITIAL_MSG]
}

function normalizeQ(s) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}
function getCached(q) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    const hit = cache[normalizeQ(q)]
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit
  } catch {}
  return null
}
function setCached(q, payload) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    cache[normalizeQ(q)] = { ...payload, ts: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

export default function AIAssistant({ open, onClose, onBooking }) {
  const [messages, setMessages] = useState(loadMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [vets, setVets] = useState([])
  const [suggestedVets, setSuggestedVets] = useState([])
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const apiKey = import.meta.env.VITE_GROQ_KEY
  const hasUserMessage = messages.some(m => m.role === 'user')

  useEffect(() => {
    if (!open) return
    getDocs(query(
      collection(db, 'users'),
      where('profession', '==', 'medico_veterinario'),
      limit(10)
    ))
      .then(snap => setVets(snap.docs.map(d => ({ uid: d.id, ...d.data() }))))
      .catch(() => {})
  }, [open])

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        if (hasUserMessage) inputRef.current?.focus()
      }, 100)
    }
  }, [open, messages.length, hasUserMessage])

  // Persiste a conversa (validade de 30 min)
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify({ ts: Date.now(), messages }))
    } catch {}
  }, [messages])

  const updateSuggestions = useCallback((text) => {
    if (vets.length === 0) return
    setSuggestedVets(rankVets(vets, text))
  }, [vets])

  async function send(text) {
    const content = text.trim().slice(0, 1000)
    if (!content || loading) return

    const userMsg = { role: 'user', content }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')

    if (!apiKey) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'IA não configurada. Adicione VITE_GROQ_KEY no .env.local.' }])
      return
    }

    // Cache: mesma pergunta em até 2 min reusa a resposta (sem gastar tokens)
    const cached = getCached(content)
    if (cached) {
      if (cached.suggestsBooking) updateSuggestions(content)
      else setSuggestedVets([])
      setMessages(prev => [...prev, { role: 'assistant', content: cached.reply, suggestsBooking: cached.suggestsBooking }])
      return
    }

    setLoading(true)
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 200,
          temperature: 0.4,
          messages: [
            { role: 'system', content: buildPrompt(vets) },
            ...newMessages.filter(m => !m.isInitial).slice(-8).map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      })
      const data = await res.json()
      const raw = data.choices?.[0]?.message?.content || data.error?.message || 'Não consegui responder.'
      const suggestsBooking = raw.includes('[SUGGEST_BOOKING]')
      const reply = raw.replace('[SUGGEST_BOOKING]', '').trim()
      if (suggestsBooking) updateSuggestions(content)
      else setSuggestedVets([])
      setCached(content, { reply, suggestsBooking })
      setMessages(prev => [...prev, { role: 'assistant', content: reply, suggestsBooking }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erro de conexão. Tente novamente.' }])
    } finally {
      setLoading(false)
    }
  }

  function resetChat() {
    setMessages([INITIAL_MSG])
    setSuggestedVets([])
    try { localStorage.removeItem(CHAT_KEY) } catch {}
  }

  function handleSubmit(e) {
    e.preventDefault()
    send(input)
  }

  if (!open) return null

  const onlineCount = vets.filter(v => v.is_online).length

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
         style={{ maxWidth: '640px', left: '50%', transform: 'translateX(-50%)' }}>

      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
           style={{ height: '88vh' }}>

        {/* ── Header gradient ─────────────────────────────── */}
        <div className="bg-gradient-to-br from-primary to-primary-700 px-5 pt-3 pb-5 flex-shrink-0">
          {/* Handle */}
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 bg-white/30 rounded-full" />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-white text-base leading-tight">Triagem Avante</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  <p className="text-white/70 text-xs">
                    {onlineCount > 0 ? `${onlineCount} vet${onlineCount > 1 ? 's' : ''} online agora` : 'Assistente ativo'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasUserMessage && (
                <button onClick={resetChat} title="Nova conversa"
                  className="w-8 h-8 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
              <button onClick={onClose}
                className="w-8 h-8 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center transition-colors">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── Messages area ────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">

          {/* Chat messages */}
          {messages.map((msg, i) => (
            <div key={i} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {!msg.isInitial && (
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-white rounded-br-md'
                    : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}>
                  {msg.content}
                </div>
              )}
              {msg.isInitial && (
                <div className="max-w-[85%] px-4 py-3 bg-gray-100 text-gray-800 rounded-2xl rounded-bl-md text-sm leading-relaxed">
                  {msg.content}
                </div>
              )}
              {msg.suggestsBooking && onBooking && (
                <button
                  onClick={() => { onClose(); onBooking(null) }}
                  className="flex items-center gap-2 bg-primary text-white text-sm font-bold
                             px-5 py-2.5 rounded-2xl hover:bg-primary/90 transition-all active:scale-95 shadow-md shadow-primary/30"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Agendar veterinário agora
                </button>
              )}
            </div>
          ))}

          {/* Quick options — depois da mensagem inicial */}
          {!hasUserMessage && (
            <div className="flex flex-col gap-2 mt-1">
              {QUICK_OPTIONS.map(opt => (
                <button
                  key={opt.text}
                  onClick={() => send(opt.text)}
                  className="flex items-center gap-3 w-full text-left px-4 py-3 bg-gray-50
                             border border-gray-200 rounded-2xl hover:border-primary/40 hover:bg-primary/5
                             transition-all active:scale-[0.98] text-sm font-medium text-gray-700"
                >
                  <span className="text-lg flex-shrink-0">{opt.label.split(' ')[0]}</span>
                  <span>{opt.label.slice(opt.label.indexOf(' ') + 1)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Typing indicator */}
          {loading && (
            <div className="flex items-start">
              <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1 items-center h-4">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Vet suggestions ─────────────────────────── */}
          {suggestedVets.length > 0 && hasUserMessage && !loading && (
            <div className="mt-1">
              <p className="text-xs font-semibold text-gray-400 mb-2 px-1">Veterinários recomendados</p>
              <div className="flex flex-col gap-2">
                {suggestedVets.map(v => (
                  <VetSuggestionCard key={v.uid} vet={v} onBook={() => { onClose(); onBooking?.(v) }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input bar ───────────────────────────────────── */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              maxLength={1000}
              placeholder="Descreva o que está acontecendo..."
              className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 text-sm outline-none
                         focus:ring-2 focus:ring-primary/25 focus:bg-white transition-all"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="w-11 h-11 bg-primary rounded-2xl flex items-center justify-center
                         disabled:opacity-40 transition-all active:scale-90 shadow-sm flex-shrink-0"
            >
              {loading
                ? <Spinner size={16} color="white" />
                : <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

/* ── Vet suggestion card ─────────────────────────────────────── */
function VetSuggestionCard({ vet, onBook }) {
  const featured = isFeatured(vet)
  const specs = Array.isArray(vet.specialties)
    ? vet.specialties.slice(0, 2).join(' · ')
    : (vet.specialty || 'Clínico geral')
  const rating = vet.averageRating ? Number(vet.averageRating).toFixed(1) : null
  const initial = (vet.name || '?')[0].toUpperCase()

  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
      featured
        ? 'border-amber-200 bg-amber-50/60'
        : 'border-gray-200 bg-white'
    }`}>
      {/* Avatar */}
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base flex-shrink-0 ${
        featured ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'
      }`}>
        {initial}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-bold text-sm text-gray-900 truncate">{vet.name}</p>
          {featured && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
              ⭐ Destaque
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 truncate mt-0.5">{specs}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`flex items-center gap-1 text-[11px] font-semibold ${vet.is_online ? 'text-green-600' : 'text-gray-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${vet.is_online ? 'bg-green-500' : 'bg-gray-300'}`} />
            {vet.is_online ? 'Online' : 'Offline'}
          </span>
          {rating && (
            <span className="text-[11px] text-gray-500 flex items-center gap-0.5">
              ★ {rating}
            </span>
          )}
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onBook}
        className={`text-xs font-bold px-3 py-2 rounded-xl flex-shrink-0 transition-all active:scale-95 ${
          featured
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'bg-primary text-white hover:bg-primary/90'
        }`}
      >
        Agendar
      </button>
    </div>
  )
}
