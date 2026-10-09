import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App'
import { capturarOrigem } from './services/origem'
import './styles/globals.scss'

// Deploy novo com o app aberto: o HTML antigo pede pedaços de código que
// não existem mais no servidor, e a tela quebrava ao navegar. Recarrega
// uma vez (já na versão nova). A marca evita laço se o erro for outro.
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('avante-recarregou')) return
    sessionStorage.setItem('avante-recarregou', '1')
  } catch { /* storage indisponível: recarrega mesmo assim */ }
  e.preventDefault()
  window.location.reload()
})
window.addEventListener('load', () => {
  // Carregou inteiro: libera um próximo recarregamento em outro deploy.
  setTimeout(() => { try { sessionStorage.removeItem('avante-recarregou') } catch { /* */ } }, 10000)
})

// Antes do React: a primeira tela pode redirecionar e levar a query
// string embora (a raiz manda para /login, por exemplo).
capturarOrigem()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
