import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import { ThemeProvider } from './hooks/useTheme'
import { UsuarioProvider } from './hooks/useUsuario'
import { IdiomaProvider } from './hooks/useIdioma'
import './theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <IdiomaProvider>
        <BrowserRouter>
          <AuthProvider>
            <UsuarioProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </UsuarioProvider>
          </AuthProvider>
        </BrowserRouter>
      </IdiomaProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
