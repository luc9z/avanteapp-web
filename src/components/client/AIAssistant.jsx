import { useState, useRef, useEffect, useCallback } from 'react'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../../firebase'
import Spinner from '../common/Spinner'
import { askAI, hasAI, NO_KEY_MESSAGE } from '../../services/ai'
import { extrairDestinos, atalhosDeAjuda, caminhoEmTexto } from '../../services/appMap'
import AIDestinoCard, { AIAtalhosAjuda } from '../common/AIDestinoCard'
import TextoIA from '../common/TextoIA'
import { useAuth } from '../../contexts/AuthContext'
import { readUser, writeUser, removeUser } from '../../services/userStorage'

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
  // Não descarta ninguém: match de espécie só dá boost. A triagem escolhe
  // pelo caso (espécie, online, nota): o plano pago NÃO muda a recomendação.
  // Patrocínio é anúncio na busca, identificado como tal; na triagem de
  // saúde, favorecer quem paga seria enganar o tutor.
  return [...vets].sort((a, b) => {
    const ma = vetMatchesSpecialties(a, specs) ? 1 : 0
    const mb = vetMatchesSpecialties(b, specs) ? 1 : 0
    if (ma !== mb) return mb - ma
    const oa = a.is_online ? 1 : 0, ob = b.is_online ? 1 : 0
    if (oa !== ob) return ob - oa
    return Number(b.averageRating || 0) - Number(a.averageRating || 0)
  }).slice(0, 4)
}


const INITIAL_MSG = {
  role: 'assistant',
  content: 'Conte o que está acontecendo com seu animal. Quanto mais detalhe, melhor eu ajudo.',
  isInitial: true,
}

/* Exemplos concretos em vez de categorias: "Está doente" fazia a IA
   perguntar tudo de novo antes de ajudar. */
const QUICK_OPTIONS = [
  { label: 'Meu animal está doente',
    exemplo: 'Meu cachorro não quer comer desde ontem' },
  { label: 'Ferida ou machucado',
    exemplo: 'Meu gato tem um corte na pata' },
  { label: 'Dúvida sobre remédio',
    exemplo: 'Posso dar dipirona para o meu cão?' },
  { label: 'Quero marcar atendimento',
    exemplo: 'Quero agendar uma consulta' },
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

// As chaves carregam o uid: a conversa fala da saúde do animal e não
// pode reaparecer para outra conta que use o mesmo navegador.
function loadMessages(uid) {
  const raw = readUser(CHAT_KEY, uid)
  if (raw && Date.now() - raw.ts < CHAT_TTL && Array.isArray(raw.messages) && raw.messages.length > 0) {
    return raw.messages
  }
  return [INITIAL_MSG]
}

function normalizeQ(s) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}
function getCached(uid, q) {
  const cache = readUser(CACHE_KEY, uid) || {}
  const hit = cache[normalizeQ(q)]
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit
  return null
}
function setCached(uid, q, payload) {
  const cache = readUser(CACHE_KEY, uid) || {}
  cache[normalizeQ(q)] = { ...payload, ts: Date.now() }
  writeUser(CACHE_KEY, uid, cache)
}


/**
 * Depois de mostrar um caminho, espera e pergunta se falta algo.
 *
 * A pausa importa: perguntar junto com a resposta atropela quem ainda
 * está lendo. Alguns segundos depois a pessoa já decidiu se resolveu, e
 * aí a pergunta ajuda em vez de atrapalhar.
 *
 * Só dispara uma vez por resposta, e some se a pessoa voltar a
 * escrever - quem já está digitando não precisa ser convidado.
 */
function useOfereceMaisAjuda(messages, setMessages, ativo) {
  useEffect(() => {
    if (!ativo) return
    const ultima = messages[messages.length - 1]
    // Só depois de uma resposta que mostrou um destino, e nunca em
    // sequência: duas perguntas seguidas viram insistência.
    if (!ultima || ultima.role !== 'assistant') return
    if (!ultima.destinos?.length || ultima.followUp) return
    // Uma vez por PERGUNTA, não uma vez por conversa: se a pessoa
    // perguntou de novo, cabe oferecer ajuda de novo. O que não cabe é
    // repetir sem que nada tenha acontecido no meio.
    const ultimaFala = messages.map(m => m.role).lastIndexOf('user')
    const jaOfereceu = messages.slice(ultimaFala + 1).some(m => m.followUp)
    if (jaOfereceu) return

    const id = setTimeout(() => {
      setMessages(prev => {
        const fim = prev[prev.length - 1]
        // A pessoa escreveu enquanto esperávamos: deixa quieto.
        if (!fim || fim.role !== 'assistant' || !fim.destinos?.length) return prev
        return [...prev, {
          role: 'assistant',
          content: 'Conseguiu? Se precisar de mais alguma coisa, é só perguntar.',
          followUp: true,
        }]
      })
    }, 6000)
    return () => clearTimeout(id)
  }, [messages, setMessages, ativo])
}

export default function AIAssistant({ open, onClose, onBooking }) {
  const { user } = useAuth()
  const uid = user?.uid
  const [messages, setMessages] = useState(() => loadMessages(uid))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [vets, setVets] = useState([])
  const [suggestedVets, setSuggestedVets] = useState([])
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const aiReady = hasAI()
  const hasUserMessage = messages.some(m => m.role === 'user')
  useOfereceMaisAjuda(messages, setMessages, open)
  const atalhos = atalhosDeAjuda('client')

  /**
   * Atalho de ajuda: responde direto do mapa, sem chamar a IA.
   *
   * A resposta já existe e é confiável; gastar uma chamada nela seria
   * pagar mais caro por algo pior. Também deixa a ajuda funcionando
   * quando a IA está fora do ar ou o limite por minuto estourou.
   */
  function responderAtalho(destino) {
    setMessages(prev => [
      ...prev,
      { role: 'user', content: `Como faço: ${destino.titulo.toLowerCase()}?` },
      { role: 'assistant', content: destino.resumo, destinos: [destino] },
    ])
  }


  useEffect(() => {
    if (!open) return
    getDocs(query(
      collection(db, 'users'),
      where('profession', '==', 'medico_veterinario'),
      where('crmvVerified', '==', true),
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

  // Trocou de conta: recarrega a conversa daquele usuário (ou começa
  // do zero). Sem isto, o estado inicial ficaria preso no primeiro uid.
  useEffect(() => {
    setMessages(loadMessages(uid))
    setSuggestedVets([])
  }, [uid])

  // Persiste a conversa (validade de 30 min)
  useEffect(() => {
    writeUser(CHAT_KEY, uid, { ts: Date.now(), messages })
  }, [messages, uid])

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

    if (!aiReady) {
      setMessages(prev => [...prev, { role: 'assistant', content: NO_KEY_MESSAGE }])
      return
    }

    // Cache: mesma pergunta em até 2 min reusa a resposta (sem gastar tokens)
    const cached = getCached(uid, content)
    if (cached) {
      updateSuggestions(content)
      setMessages(prev => [...prev, {
        role: 'assistant', content: cached.reply,
        // Cache gravado antes desta versão não tem destinos.
        suggestsBooking: cached.suggestsBooking, destinos: cached.destinos || [],
      }])
      return
    }

    setLoading(true)
    try {
      const raw = await askAI({
        mode: 'client',
        context: {
          vets: rankVets(vets, content).map(v => ({
            name: v.name,
            featured: isFeatured(v),
            online: !!v.is_online,
            specialties: Array.isArray(v.specialties) ? v.specialties.join(', ') : (v.specialty || 'Clínico geral'),
          })),
        },
        messages: newMessages
          .filter(m => !m.isInitial)
          .slice(-8)
          .map(m => ({ role: m.role, content: m.content })),
      })
      const suggestsBooking = raw.includes('[SUGGEST_BOOKING]')
      // A lista de profissionais não depende mais do marcador: toda
      // resposta clínica termina com quem pode olhar o animal.
      updateSuggestions(content)
      // [IR:chave] vira botão que leva à tela e acende o elemento.
      const { texto: reply, destinos } = extrairDestinos(
        raw.replace('[SUGGEST_BOOKING]', ''))
      if (suggestsBooking) updateSuggestions(content)
      setCached(uid, content, { reply, suggestsBooking, destinos })
      setMessages(prev => [...prev, { role: 'assistant', content: reply, suggestsBooking, destinos }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: e?.message === 'NO_KEY' ? NO_KEY_MESSAGE : (e?.message || 'Erro de conexão. Tente novamente.'),
      }])
    } finally {
      setLoading(false)
    }
  }

  function resetChat() {
    setMessages([INITIAL_MSG])
    setSuggestedVets([])
    removeUser(CHAT_KEY, uid)
  }

  function handleSubmit(e) {
    e.preventDefault()
    send(input)
  }

  if (!open) return null

  const onlineCount = vets.filter(v => v.is_online).length

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">

      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden w-full sm:max-w-2xl sm:mx-auto"
           style={{ height: '88dvh', maxHeight: '88dvh' }}>

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
                <p className="font-bold text-white text-base leading-tight">AVANTE IA</p>
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
                  <TextoIA>{msg.content}</TextoIA>
                </div>
              )}
              {msg.isInitial && (
                <div className="max-w-[85%] px-4 py-3 bg-gray-100 text-gray-800 rounded-2xl rounded-bl-md text-sm leading-relaxed">
                  {msg.content}
                </div>
              )}
              {(msg.destinos || []).map(d => (
                <div key={d.chave} className="w-full max-w-[85%]">
                  <AIDestinoCard destino={d} onNavegar={onClose} />
                </div>
              ))}
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

          {/* Quick options - depois da mensagem inicial */}
          {!hasUserMessage && (
            <div className="flex flex-col gap-4 mt-1">
              <AIAtalhosAjuda destinos={atalhos} onEscolher={responderAtalho} />
              <div className="flex flex-col gap-2">
                <p className="ia-opcao-grupo">Sobre seu animal</p>
                {QUICK_OPTIONS.map(opt => (
                  <button key={opt.label} onClick={() => send(opt.exemplo)} className="ia-opcao">
                    <span>{opt.label}</span>
                    <span className="ia-opcao-exemplo">{opt.exemplo}</span>
                  </button>
                ))}
              </div>
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
              <p className="text-xs font-semibold text-gray-500 mb-2 px-1">
              Veterinários que podem examinar seu animal
            </p>
              <div className="flex flex-col gap-2">
                {suggestedVets.map(v => (
                  <VetSuggestionCard key={v.uid} vet={v} onBook={() => { onClose(); onBooking?.(v) }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Aviso fixo. Vive na interface, não no texto da IA, porque
            modelo esquece instrução - e este é o aviso que não pode
            faltar em nenhuma resposta sobre saúde de animal. */}
        {hasUserMessage && (
          <div className="px-4 pb-1">
            <p className="flex items-start gap-2 text-xs leading-snug text-gray-600
                          bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <svg className="w-3.5 h-3.5 flex-shrink-0 mt-px" fill="none" stroke="currentColor"
                strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span>
                Orientação automática, sujeita a erro. Não é diagnóstico: só um
                veterinário confirma examinando o animal.
              </span>
            </p>
          </div>
        )}

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

  // Patrocinado (plano pago): mesmo cartão dos demais, com o dourado apenas como acento
  // (borda fina + selo), como nos cartões de plano. Antes o cartão
  // inteiro virava laranja e destoava do resto do sistema.
  if (featured) {
    return (
      <div className="relative flex items-center gap-3 p-3 rounded-2xl bg-white
                      border-2 border-amber-300/70 shadow-card transition-all">
        <span className="absolute -top-2 left-3 z-10 flex items-center gap-1 bg-amber-100 text-amber-700
                         text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Patrocinado
        </span>

        {vet.photoURL ? (
          <img src={vet.photoURL} alt={vet.name}
            className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base
                          flex-shrink-0 bg-primary/10 text-primary">
            {initial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-gray-900 truncate mt-1">{vet.name}</p>
          <p className="text-xs text-gray-400 truncate mt-0.5">{specs}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`flex items-center gap-1 text-[11px] font-semibold ${vet.is_online ? 'text-green-600' : 'text-gray-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${vet.is_online ? 'bg-green-500' : 'bg-gray-300'}`} />
              {vet.is_online ? 'Online' : 'Offline'}
            </span>
            {rating && <span className="text-[11px] text-amber-600 font-semibold">★ {rating}</span>}
          </div>
        </div>
        <button onClick={onBook} className="btn-primary btn-sm flex-shrink-0">
          Agendar
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl border border-gray-200 bg-white transition-all">
      {vet.photoURL ? (
        <img src={vet.photoURL} alt={vet.name}
          className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base flex-shrink-0 bg-primary/10 text-primary">
          {initial}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-gray-900 truncate">{vet.name}</p>
        <p className="text-xs text-gray-400 truncate mt-0.5">{specs}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`flex items-center gap-1 text-[11px] font-semibold ${vet.is_online ? 'text-green-600' : 'text-gray-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${vet.is_online ? 'bg-green-500' : 'bg-gray-300'}`} />
            {vet.is_online ? 'Online' : 'Offline'}
          </span>
          {rating && <span className="text-[11px] text-gray-500">★ {rating}</span>}
        </div>
      </div>
      <button onClick={onBook}
        className="text-xs font-bold px-3 py-2 rounded-xl flex-shrink-0 transition-all active:scale-95 bg-primary text-white hover:bg-primary/90">
        Agendar
      </button>
    </div>
  )
}
