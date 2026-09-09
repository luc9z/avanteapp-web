/**
 * useTelaLarga - a tela comporta lista e detalhe lado a lado?
 *
 * Não dá para resolver isso só com CSS: no desktop o toque num pedido
 * precisa SELECIONAR (mantendo a lista à vista), e no celular precisa
 * NAVEGAR. É uma diferença de comportamento, não de aparência.
 *
 * O limite é o mesmo `lg` do Tailwind, para a lateral da navegação e o
 * painel de detalhe aparecerem juntos.
 */
import { useEffect, useState } from 'react'

const CONSULTA = '(min-width: 1024px)'

export default function useTelaLarga() {
  const [larga, setLarga] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(CONSULTA).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA)
    const aoMudar = e => setLarga(e.matches)
    // addEventListener não existe no Safari antigo; addListener sim.
    if (mq.addEventListener) mq.addEventListener('change', aoMudar)
    else mq.addListener(aoMudar)
    setLarga(mq.matches)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', aoMudar)
      else mq.removeListener(aoMudar)
    }
  }, [])

  return larga
}
