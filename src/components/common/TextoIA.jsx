/**
 * TextoIA - renderiza a resposta do modelo sem markdown cru na tela.
 *
 * O prompt pede texto puro, mas modelo ignora instrução de formato com
 * alguma frequência - e quando ignora, o usuário via literalmente
 * "Abra a aba **Perfil**". Aqui o markdown simples vira formatação de
 * verdade, e o que não for reconhecido pelo menos perde os símbolos.
 *
 * Sem dangerouslySetInnerHTML: o texto vem de um modelo, que por sua
 * vez recebe conteúdo escrito por usuários. Não é lugar de injetar HTML.
 */

/** Quebra o texto em pedaços normais e em negrito. */
function pedacos(linha) {
  const out = []
  const re = /\*\*(.+?)\*\*|__(.+?)__/g
  let ultimo = 0
  let m
  while ((m = re.exec(linha))) {
    if (m.index > ultimo) out.push({ t: linha.slice(ultimo, m.index) })
    out.push({ t: m[1] ?? m[2], forte: true })
    ultimo = re.lastIndex
  }
  if (ultimo < linha.length) out.push({ t: linha.slice(ultimo) })
  return out
}

/** Tira marcações que não valem a pena renderizar, sem comer o conteúdo. */
function limpar(linha) {
  return linha
    .replace(/^\s{0,3}#{1,6}\s+/, '')      // títulos markdown
    .replace(/^\s{0,3}[-*]\s+/, '• ')      // marcadores viram bullet
    .replace(/`{1,3}/g, '')                // crases de código
}

export default function TextoIA({ children }) {
  const texto = String(children ?? '')
  if (!texto.trim()) return null

  return (
    <>
      {texto.split('\n').map((linha, i) => {
        const l = limpar(linha)
        if (!l.trim()) return <span key={i} className="block h-2" />
        return (
          <span key={i} className="block">
            {pedacos(l).map((p, j) =>
              p.forte
                ? <strong key={j} className="font-bold">{p.t}</strong>
                : <span key={j}>{p.t}</span>,
            )}
          </span>
        )
      })}
    </>
  )
}
