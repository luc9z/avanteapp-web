/**
 * SplashPage — abertura do Avante com a identidade nova.
 *
 * INSTALAÇÃO (2 passos):
 * 1. Salve a imagem `avante-logo-final-branco.png` em
 *    public/images/avante_mark_white.png
 *    (e troque public/images/avante_logo.png pela `avante-logo-final-simbolo.png`
 *    para atualizar logo, login e navbar de uma vez)
 * 2. Substitua src/pages/auth/SplashPage.jsx por este arquivo.
 *
 * Autocontida: os keyframes vivem num <style> local, então não depende
 * de nada no globals.scss e não conflita com animações existentes.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { resolveHomeRoute } from '../../services/userRole'

const KEYFRAMES = `
@keyframes splashRing {
  0%   { transform: scale(0.55); opacity: 0.5; }
  100% { transform: scale(1.55); opacity: 0; }
}
@keyframes splashFloat {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
}
@keyframes splashFadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes splashDot {
  0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); }
  40%           { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .sp-anim { animation: none !important; }
}
`

export default function SplashPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    let cancelled = false
    const timer = setTimeout(async () => {
      if (!user) { navigate('/login', { replace: true }); return }
      const route = await resolveHomeRoute(user.uid)
      if (!cancelled) navigate(route, { replace: true })
    }, 1600)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [loading, user, navigate])

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(circle at 50% 42%, #33502f 0%, #1d2e1d 55%, #141f14 100%)' }}
    >
      <style>{KEYFRAMES}</style>

      {/* Trilha de patas sutil ao fundo */}
      {[
        { top: '10%', right: '6%', size: 110, rot: 18 },
        { top: '26%', right: '-2%', size: 80, rot: 30 },
        { bottom: '20%', left: '4%', size: 95, rot: -20 },
        { bottom: '6%', left: '-3%', size: 130, rot: -28 },
      ].map((p, i) => (
        <img
          key={i}
          src="/images/avante_mark_white.png"
          alt=""
          aria-hidden
          className="absolute select-none pointer-events-none"
          style={{ ...p, width: p.size, opacity: 0.05, transform: `rotate(${p.rot}deg)` }}
        />
      ))}

      {/* Símbolo com anéis */}
      <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
        {[0, 0.7, 1.4].map(delay => (
          <span
            key={delay}
            className="sp-anim absolute inset-0 rounded-full border border-white/25"
            style={{ animation: `splashRing 2.2s ease-out ${delay}s infinite` }}
          />
        ))}
        <div
          className="sp-anim flex items-center justify-center rounded-full"
          style={{
            width: 168, height: 168,
            background: 'rgba(255,255,255,0.06)',
            animation: 'splashFloat 3.2s ease-in-out infinite',
          }}
        >
          <img src="/images/avante_mark_white.png" alt="Avante" style={{ width: 96 }} draggable={false} />
        </div>
      </div>

      {/* Wordmark + tagline */}
      <div className="sp-anim text-center mt-7" style={{ animation: 'splashFadeUp 0.7s ease 0.25s both' }}>
        <p className="text-white font-bold tracking-tight" style={{ fontSize: 44, lineHeight: 1 }}>
          avante
        </p>
        <p className="text-[11px] font-medium tracking-[0.25em] mt-2.5" style={{ color: '#aebcae' }}>
          VETERINÁRIO ONDE VOCÊ ESTIVER
        </p>
      </div>

      {/* Loading dots */}
      <div className="absolute flex gap-2" style={{ bottom: '9%' }}>
        {[0, 0.18, 0.36].map(d => (
          <span
            key={d}
            className="sp-anim w-2 h-2 rounded-full bg-white"
            style={{ animation: `splashDot 1.3s ease-in-out ${d}s infinite` }}
          />
        ))}
      </div>
    </div>
  )
}
