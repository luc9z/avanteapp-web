/**
 * VetAssistant - copiloto de IA do veterinário.
 *
 * Diferente do assistente do cliente (que faz triagem e recomenda um
 * profissional), este é uma ferramenta de trabalho: doses, protocolos,
 * diagnóstico diferencial, texto de receita e apoio de gestão. Recebe
 * o contexto real do vet (áreas de atuação, atendimentos do dia) para
 * responder de forma específica.
 *
 * Não substitui julgamento clínico - o aviso fica visível na tela.
 */
import { useState, useRef, useEffect } from 'react'
import Spinner from '../common/Spinner'
import { askAI, hasAI, NO_KEY_MESSAGE } from '../../services/ai'
import { extrairDestinos, atalhosDeAjuda, caminhoEmTexto } from '../../services/appMap'
import AIDestinoCard, { AIAtalhosAjuda } from '../common/AIDestinoCard'
import TextoIA from '../common/TextoIA'
import { useAuth } from '../../contexts/AuthContext'
import { readUser, writeUser, removeUser } from '../../services/userStorage'

const INITIAL = {
  role: 'assistant',
  // Curta de propósito: os assuntos já aparecem logo abaixo. O que a
  // frase acrescenta é COMO perguntar - dizer peso e espécie muda a
  // qualidade da resposta mais do que qualquer outra coisa.
  content: 'Pergunte direto. Em cálculo de dose, diga a espécie e o peso: é o que muda a resposta.',
  isInitial: true,
}

/* Cada atalho leva um exemplo pronto no formato que gera boa resposta.
   É o exemplo que vai para a IA, não o rótulo: "Calcular dose" sozinho
   obrigava a IA a pedir os dados antes de responder qualquer coisa. */
const QUICK = [
  { label: 'Calcular dose',
    exemplo: 'Dose de meloxicam para cão de 12 kg' },
  { label: 'Diagnóstico diferencial',
    exemplo: 'Bezerro com diarreia há 3 dias, sem febre' },
  { label: 'Protocolo de atendimento',
    exemplo: 'Protocolo anestésico para castração de gata' },
  { label: 'Texto de receita',
    exemplo: 'Posologia de amoxicilina para cão de 20 kg' },
]


/* ── Persistência da conversa ────────────────────────────────────
   O copiloto vive na barra inferior, que é remontada a cada troca de
   aba - sem isto a conversa se perdia ao navegar. Guarda por 2h. */
const CHAT_KEY = 'avante-vet-chat'
const CHAT_TTL = 2 * 60 * 60 * 1000

function loadMessages(uid) {
  const raw = readUser(CHAT_KEY, uid)
  if (raw && Date.now() - raw.ts < CHAT_TTL && Array.isArray(raw.messages) && raw.messages.length > 0) {
    return raw.messages
  }
  return [INITIAL]
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

export default function VetAssistant({ open, onClose, specialties = [], todayCount = 0 }) {
  const { user } = useAuth()
  const uid = user?.uid
  const [messages, setMessages] = useState(() => loadMessages(uid))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const hasUserMessage = messages.some(m => m.role === 'user')
  useOfereceMaisAjuda(messages, setMessages, open)
  const atalhos = atalhosDeAjuda('vet')

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
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      if (hasUserMessage) inputRef.current?.focus()
    }, 100)
  }, [open, messages.length, hasUserMessage])

  // Trocou de conta: recarrega a conversa daquele veterinário.
  useEffect(() => { setMessages(loadMessages(uid)) }, [uid])

  // Mantém a conversa entre trocas de aba.
  useEffect(() => {
    writeUser(CHAT_KEY, uid, { ts: Date.now(), messages })
  }, [messages, uid])

  function resetChat() {
    setMessages([INITIAL])
    removeUser(CHAT_KEY, uid)
  }

  async function send(text) {
    const content = text.trim().slice(0, 1500)
    if (!content || loading) return

    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')

    if (!hasAI()) {
      setMessages(prev => [...prev, { role: 'assistant', content: NO_KEY_MESSAGE }])
      return
    }

    setLoading(true)
    try {
      const reply = await askAI({
        mode: 'vet',
        context: { specialties: specialties.join(', '), todayCount },
        messages: next.filter(m => !m.isInitial).slice(-10).map(m => ({ role: m.role, content: m.content })),
      })
      const { texto, destinos } = extrairDestinos(reply)
      setMessages(prev => [...prev, { role: 'assistant', content: texto, destinos }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: e?.message === 'NO_KEY' ? NO_KEY_MESSAGE : (e?.message || 'Erro de conexão. Tente novamente.'),
      }])
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full sm:max-w-2xl sm:mx-auto bg-white rounded-t-3xl sm:rounded-3xl
                      sm:mb-6 shadow-2xl flex flex-col overflow-hidden"
           style={{ height: '88dvh', maxHeight: '88dvh' }}>

        {/* Cabeçalho */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-lg">🩺</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm">AVANTE IA</p>
            <p className="text-[11px] text-gray-500">Apoio de consulta, sujeito a erro. A decisão é sua</p>
          </div>
          {hasUserMessage && (
            <button onClick={resetChat} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              aria-label="Nova conversa" title="Nova conversa">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            aria-label="Fechar">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Conversa */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-primary text-white chat-mine'
                  : 'bg-gray-100 text-gray-800 chat-other'
              }`}>
                <TextoIA>{m.content}</TextoIA>
              </div>
              {(m.destinos || []).map(d => (
                <div key={d.chave} className="w-full max-w-[85%]">
                  <AIDestinoCard destino={d} onNavegar={onClose} />
                </div>
              ))}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 px-4 py-3 rounded-2xl chat-other">
                <Spinner size={16} color="#375337" />
              </div>
            </div>
          )}

          {!hasUserMessage && (
            <div className="flex flex-col gap-4 mt-2">
              <AIAtalhosAjuda destinos={atalhos} onEscolher={responderAtalho} />
              <div className="flex flex-col gap-2">
                <p className="ia-opcao-grupo">Apoio clínico</p>
                {QUICK.map(q => (
                  <button key={q.label} onClick={() => send(q.exemplo)} className="ia-opcao">
                    <span>{q.label}</span>
                    <span className="ia-opcao-exemplo">{q.exemplo}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Entrada */}
        <div className="border-t border-gray-100 px-4 py-3 flex-shrink-0"
             style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex gap-2 items-end">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ex: dose de meloxicam para cão de 12 kg"
              className="input-field flex-1"
            />
            <button type="submit" disabled={!input.trim() || loading}
              className="btn-primary !px-4 !min-h-[48px] flex-shrink-0" aria-label="Enviar">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
