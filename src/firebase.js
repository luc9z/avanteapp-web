import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

/**
 * Configuração 100% via variáveis de ambiente.
 *
 * IMPORTANTE: cada variável é acessada de forma ESTÁTICA
 * (import.meta.env.VITE_X). Acesso dinâmico (import.meta.env[k])
 * faria o Vite embutir o objeto env inteiro no bundle — incluindo
 * qualquer outra variável presente no .env.local.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Falha explícita se o .env estiver incompleto, em vez de conectar
// silenciosamente em um projeto errado (os fallbacks hardcoded foram removidos).
if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId || !firebaseConfig.authDomain) {
  throw new Error('Configuração do Firebase incompleta. Confira as variáveis VITE_FIREBASE_* no .env.local')
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
// experimentalAutoDetectLongPolling: quando o WebChannel do Firestore
// é bloqueado (Brave Shields, adblockers, proxies corporativos), o SDK
// cai automaticamente para long-polling — o chat continua funcionando.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
})
export const functions = getFunctions(app, 'southamerica-east1')
export const googleProvider = new GoogleAuthProvider()

export default app
