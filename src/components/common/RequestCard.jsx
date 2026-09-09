/**
 * RequestCard - o cartão de uma solicitação, nas duas telas.
 *
 * Existia um cartão rico do lado do veterinário (rosto, animal, local)
 * e um quase vazio do lado do cliente (serviço, "Para: fulano", data).
 * A mesma informação, dois desenhos. Agora é um componente só, que
 * troca de perspectiva: cada lado vê o ROSTO DA OUTRA PESSOA, que é o
 * que ajuda a reconhecer o atendimento na lista.
 *
 * `perspectiva` diz quem está olhando, não de quem é o pedido.
 */
import { statusInfo, acaoDoCliente, normalizeStatus } from '../../utils/status'

/* ── Ícones pequenos. Sem emoji: eles mudam de forma em cada sistema
      e desalinham a linha. ─────────────────────────────────────── */
const Icone = ({ d, className = '' }) => (
  <svg className={`w-3.5 h-3.5 flex-shrink-0 ${className}`} fill="none"
    stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)
const PATH = {
  pata: 'M12 21s-6.716-4.35-8.657-8.232C1.79 9.61 3.13 6 6.5 6c1.79 0 3.02 1.02 3.75 2.02L12 9.75l1.75-1.73C14.48 7.02 15.71 6 17.5 6c3.37 0 4.71 3.61 3.157 6.768C18.716 16.65 12 21 12 21z',
  local: 'M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z',
  relogio: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  alerta: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z',
}

/**
 * Foto quando existe; a inicial do nome quando não. Sem ninguém
 * atribuído ainda, uma silhueta - tirar a inicial de "Aguardando
 * veterinário" dava um "A" que não é nome de pessoa nenhuma.
 */
function Avatar({ nome, foto, vazio }) {
  if (vazio) {
    return (
      <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center
                      bg-gray-100 text-gray-400">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
    )
  }
  if (foto) {
    return (
      <img src={foto} alt="" loading="lazy"
        className="w-12 h-12 rounded-2xl object-cover flex-shrink-0 bg-gray-100" />
    )
  }
  return (
    <div className="avatar-circle w-12 h-12 !rounded-2xl text-lg flex-shrink-0">
      {(nome || '?').trim()[0]?.toUpperCase() || '?'}
    </div>
  )
}

/**
 * @param {object} p
 * @param {object} p.req          documento da solicitação
 * @param {'client'|'vet'} p.perspectiva  quem está olhando a lista
 * @param {string} [p.foto]       foto da outra pessoa, quando já resolvida
 * @param {() => void} p.onClick
 */
export default function RequestCard({ req, perspectiva, foto, onClick }) {
  const info = statusInfo(req.status)
  const ehCliente = perspectiva === 'client'

  // Cada lado vê a outra ponta do atendimento.
  const semAtribuicao = ehCliente && !req.professionalName
  const outroNome = ehCliente
    ? (req.professionalName || 'Aguardando veterinário')
    : (req.clientName || 'Cliente')
  const papel = ehCliente ? 'Veterinário' : 'Cliente'

  const acao = ehCliente ? acaoDoCliente(req) : null
  // O selo de status ja mostra "Urgente" quando o status e urgente;
  // repetir embaixo era a mesma informacao duas vezes no mesmo cartao.
  const urgente = (req.urgency === 'urgent' || req.isUrgent === true)
    && normalizeStatus(req.status) !== 'urgente'

  return (
    <button
      type="button"
      data-coach="req-card"
      onClick={onClick}
      className="card w-full h-full text-left flex flex-col gap-3 p-4
                 transition-all duration-200 hover:shadow-card-hover
                 hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <Avatar nome={outroNome} foto={foto} vazio={semAtribuicao} />

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{papel}</p>
          <p className="font-bold text-gray-900 text-sm truncate leading-snug">{outroNome}</p>
          <p className="text-xs text-gray-500 truncate mt-0.5">{req.service || 'Atendimento'}</p>
        </div>

        <span className={`${info.cls} flex-shrink-0`}>{info.label}</span>
      </div>

      {/* Faixa do meio: o que varia de um pedido para outro. Cresce
          para ocupar a sobra, empurrando o rodape para baixo. */}
      <div className="flex-1 flex flex-col gap-1.5 text-xs text-gray-500 min-h-[1.25rem]">
        {req.petName && (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <Icone d={PATH.pata} />
            <span className="truncate">
              {req.petName}{req.petSpecies ? ` · ${req.petSpecies}` : ''}
            </span>
          </span>
        )}
        {req.location && (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <Icone d={PATH.local} />
            <span className="truncate">{req.location}</span>
          </span>
        )}
        {urgente && (
          <span className="inline-flex items-center gap-1.5 font-bold text-red-600">
            <Icone d={PATH.alerta} />
            Emergência
          </span>
        )}
      </div>

      {/* Rodape: existe em TODO cartao, entao todos terminam igual.
          A data sozinha ja garante a faixa; a acao entra ao lado
          quando o pedido espera algo de voce. */}
      <div className="flex items-center gap-2 pt-2.5 border-t border-gray-100">
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
          <Icone d={PATH.relogio} />
          {formatarData(req.createdAt)}
        </span>
        {acao && (
          <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600 min-w-0 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
            <span className="truncate">{acao}</span>
          </span>
        )}
      </div>
    </button>
  )
}

function formatarData(ts) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null
  if (!d || isNaN(d)) return '-'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
