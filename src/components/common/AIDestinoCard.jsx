/**
 * AIDestinoCard - o "me leve lá" das respostas da IA.
 *
 * Fecha o ciclo do guia: a IA explica em palavras, o cartão mostra o
 * caminho em passos e leva até a tela acendendo o elemento certo.
 * Explicar por escrito onde fica um botão é justamente o que não
 * funciona para quem já não estava achando; mostrar funciona.
 *
 * Os passos ficam visíveis mesmo sem tocar no botão, porque parte das
 * pessoas prefere fazer o caminho com as próprias mãos - e quem faz
 * uma vez aprende, quem é teleportado não.
 *
 * O destaque reaproveita a máscara do CoachTour: a pessoa vê o mesmo
 * gesto dos tutoriais, que já conhece.
 */
import { useLocation, useNavigate } from 'react-router-dom'
import { destacarNoApp } from './CoachTour'

/** Espera a tela nova montar antes de procurar o elemento. */
const ESPERA_RENDER = 450

export default function AIDestinoCard({ destino, onNavegar }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (!destino) return null

  // Já estamos na tela: não faz sentido "ir", faz sentido apontar.
  const jaEstaAqui = pathname === destino.rota

  function ir() {
    onNavegar?.()               // fecha o chat, senão ele cobre o destaque
    if (!jaEstaAqui) navigate(destino.rota)
    if (!destino.alvo) return
    setTimeout(() => {
      destacarNoApp({
        selector: destino.alvo,
        title: destino.titulo,
        text: destino.resumo,
      })
    }, jaEstaAqui ? 120 : ESPERA_RENDER)
  }

  return (
    <div className="ia-destino">
      <div className="ia-destino-cabecalho">
        <span className="ia-destino-aba">{destino.aba}</span>
        <p className="ia-destino-titulo">{destino.titulo}</p>
      </div>

      <ol className="ia-destino-passos">
        {destino.passos.map((p, i) => (
          <li key={i}>
            <span className="ia-destino-num">{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ol>

      <button type="button" onClick={ir} className="btn-primary btn-block">
        {jaEstaAqui ? 'Mostrar na tela' : (destino.alvo ? 'Ir e mostrar' : 'Ir para essa tela')}
      </button>
    </div>
  )
}

/**
 * Atalhos de ajuda do chat. Saem do mapa, então são respostas certas de
 * graça: nenhuma chamada à IA, nenhum risco de caminho inventado.
 */
export function AIAtalhosAjuda({ destinos, onEscolher }) {
  if (!destinos?.length) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="ia-opcao-grupo">Sobre o app</p>
      {destinos.map(d => (
        <button key={d.chave} type="button" onClick={() => onEscolher(d)} className="ia-opcao">
          {d.titulo}
        </button>
      ))}
    </div>
  )
}
