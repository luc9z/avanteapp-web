/**
 * NavRail - a mesma navegação, na forma de barra lateral.
 *
 * No celular a barra fica embaixo, ao alcance do polegar. No desktop
 * isso não faz sentido: a mão está no mouse, a tela é larga e o rodapé
 * é o canto mais longe do olho. A lateral resolve e ainda libera a
 * altura inteira para o conteúdo.
 *
 * As abas NÃO são redigitadas aqui: chegam por props, da mesma lista
 * que desenha a barra de baixo. Duas listas separadas divergiriam na
 * primeira aba nova - foi o que já aconteceu neste app com os status
 * e com o mapa da IA.
 */
import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import AvanteLogo from './AvanteLogo'

/**
 * @param {object} p
 * @param {Array} p.abas        [{ to, label, icon, badge }]
 * @param {() => void} p.onIA   abre o assistente
 * @param {string} p.tituloIA
 */
export default function NavRail({ abas, onIA, tituloIA = 'AVANTE IA' }) {
  /* Marca o documento enquanto a lateral existe. O espaco dela e aberto
     por essa marca, e nao por media query solta: telas sem navegacao
     (login, cadastro, splash) ficariam com 240px vazios a esquerda. */
  useEffect(() => {
    document.documentElement.classList.add('com-rail')
    return () => document.documentElement.classList.remove('com-rail')
  }, [])

  return (
    <aside className="nav-rail" aria-label="Navegação principal">
      <div className="nav-rail-marca">
        <AvanteLogo variant="horizontal-sem-slogan" className="h-7 text-brand-verde dark:text-brand-creme" />
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {abas.map(a => (
          <NavLink
            key={a.to}
            to={a.to}
            className={({ isActive }) => `nav-rail-item ${isActive ? 'nav-rail-ativo' : ''}`}
          >
            <span className="relative flex-shrink-0">
              {a.icon}
              {a.badge > 0 && (
                <span className="nav-rail-badge">{a.badge > 9 ? '9+' : a.badge}</span>
              )}
            </span>
            <span className="truncate">{a.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* A IA é ação, não destino: fica separada das abas, embaixo. */}
      <button type="button" onClick={onIA} className="nav-rail-ia">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        {tituloIA}
      </button>
    </aside>
  )
}
