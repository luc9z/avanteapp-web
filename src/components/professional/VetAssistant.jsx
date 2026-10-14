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
  // Primeiro o assunto, depois as opções: com as duas listas juntas, o
  // vet lia oito botões antes de achar o que queria.
  content: 'Sua dúvida é sobre o app ou sobre um atendimento?',
  isInitial: true,
}

/* Os dois caminhos do primeiro passo. "Não sei" vai direto para o
   campo de texto: quem não se encaixa em nenhum escreve a dúvida. */
const ASSUNTOS = [
  { id: 'app', titulo: 'Dúvidas sobre o app',
    descricao: 'Como ficar online, aceitar pedidos, definir horários e enviar orçamento.',
    icone: 'M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3' },
  { id: 'clinico', titulo: 'Apoio clínico',
    descricao: 'Cálculo de dose, diagnóstico diferencial, protocolos e texto de receita.',
    icone: 'M11 2v2M5 2v2M5 3H4a2 2 0 00-2 2v4a6 6 0 0012 0V5a2 2 0 00-2-2h-1M8 15a6 6 0 0012 0v-3M22 10a2 2 0 11-4 0 2 2 0 014 0z' },
]

/* O exemplo do campo de texto acompanha o assunto escolhido. */
const PLACEHOLDER = {
  app: 'Ex: como mudo meu horário de atendimento?',
  clinico: 'Ex: dose de meloxicam para cão de 12 kg',
  naosei: 'Escreva sua dúvida',
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
  // Primeiro passo do menu: null (escolher), 'app', 'clinico' ou 'naosei'.
  const [assunto, setAssunto] = useState(null)
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
    setAssunto(null)
    removeUser(CHAT_KEY, uid)
  }

  function escolherAssunto(id) {
    setAssunto(id)
    // "Não sei": a resposta é escrever, então o cursor já vai para o campo.
    if (id === 'naosei') setTimeout(() => inputRef.current?.focus(), 50)
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
                {/* Conversa salva antes da mudança guarda a frase antiga. */}
                <TextoIA>{m.isInitial ? INITIAL.content : m.content}</TextoIA>
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

          {!hasUserMessage && !assunto && (
            <div className="flex flex-col gap-2 mt-2">
              {ASSUNTOS.map(a => (
                <button key={a.id} type="button" onClick={() => escolherAssunto(a.id)}
                  className="ia-opcao !flex-row items-center !gap-3 !py-3.5">
                  <span className="w-11 h-11 rounded-xl bg-primary/10 text-primary dark:bg-brand-salvia/15 dark:text-brand-salvia
                                   flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8}
                      strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
                      <path d={a.icone} />
                    </svg>
                  </span>
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span>{a.titulo}</span>
                    <span className="ia-opcao-exemplo">{a.descricao}</span>
                  </span>
                </button>
              ))}
              <button type="button" onClick={() => escolherAssunto('naosei')}
                className="self-center mt-1 px-3 min-h-[44px] text-sm font-semibold text-primary dark:text-brand-salvia
                           rounded-xl hover:bg-primary/5">
                Não sei, quero escrever minha dúvida
              </button>
            </div>
          )}

          {!hasUserMessage && assunto && (
            <div className="flex flex-col gap-2 mt-2">
              <button type="button" onClick={() => setAssunto(null)}
                className="self-start -ml-2 px-2 min-h-[40px] flex items-center gap-1 text-sm font-semibold
                           text-gray-500 hover:text-gray-800 rounded-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Voltar
              </button>

              {assunto === 'app' && <AIAtalhosAjuda destinos={atalhos} onEscolher={responderAtalho} />}

              {assunto === 'clinico' && (
                <>
                  <p className="ia-opcao-grupo">Apoio clínico</p>
                  <p className="text-xs text-gray-500 -mt-1 mb-1">
                    Em cálculo de dose, diga a espécie e o peso: é o que muda a resposta.
                  </p>
                  {QUICK.map(q => (
                    <button key={q.label} onClick={() => send(q.exemplo)} className="ia-opcao">
                      <span>{q.label}</span>
                      <span className="ia-opcao-exemplo">{q.exemplo}</span>
                    </button>
                  ))}
                </>
              )}

              {assunto === 'naosei' && (
                <p className="text-sm text-gray-500">
                  Escreva sua dúvida no campo abaixo, do jeito que vier. Eu entendo e respondo,
                  seja sobre o app ou sobre um atendimento.
                </p>
              )}
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
              placeholder={PLACEHOLDER[assunto] || 'Escreva sua dúvida'}
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
