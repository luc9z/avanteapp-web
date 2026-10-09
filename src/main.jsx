import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import App from './App'
import { capturarOrigem } from './services/origem'
import './styles/globals.scss'

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
