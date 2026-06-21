import { Component } from 'react'

/**
 * ErrorBoundary — captura erros de renderização e de carregamento
 * de chunks (lazy import), exibindo uma tela de recuperação em vez
 * de quebrar o app inteiro.
 *
 * Caso clássico em produção: o usuário está com o app aberto, um
 * novo deploy muda os hashes dos chunks, e a próxima navegação
 * falha com "Failed to fetch dynamically imported module". Nesse
 * caso recarregamos automaticamente UMA vez (o index.html novo traz
 * os chunks novos); a flag em sessionStorage evita loop de reload.
 */

const CHUNK_ERROR_RE = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed/i
const RELOAD_FLAG = 'avante-chunk-reload'

export default class ErrorBoundary extends Component {
  state = { hasError: false, isChunkError: false }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      isChunkError: CHUNK_ERROR_RE.test(error?.message || ''),
    }
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error('ErrorBoundary:', error)

    if (this.state.isChunkError && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, '1')
      window.location.reload()
    }
  }

  handleReload = () => {
    sessionStorage.removeItem(RELOAD_FLAG)
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      // Navegação saudável: libera o auto-reload para um futuro deploy
      sessionStorage.removeItem(RELOAD_FLAG)
      return this.props.children
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center gap-4 bg-white">
        <img src="/images/avante_logo.png" alt="Avante" className="w-20 h-20 object-contain opacity-90" />
        <div>
          <p className="font-bold text-gray-900 text-lg">
            {this.state.isChunkError ? 'Nova versão disponível' : 'Algo deu errado'}
          </p>
          <p className="text-gray-500 text-sm mt-1 max-w-xs">
            {this.state.isChunkError
              ? 'O aplicativo foi atualizado. Recarregue para continuar de onde parou.'
              : 'Ocorreu um erro inesperado. Recarregar a página geralmente resolve.'}
          </p>
        </div>
        <button onClick={this.handleReload} className="btn-primary px-8">
          Recarregar
        </button>
      </div>
    )
  }
}
