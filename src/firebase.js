import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth'
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

/**
 * Configuração 100% via variáveis de ambiente.
 *
 * IMPORTANTE: cada variável é acessada de forma ESTÁTICA
 * (import.meta.env.VITE_X). Acesso dinâmico (import.meta.env[k])
 * faria o Vite embutir o objeto env inteiro no bundle - incluindo
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
// cai automaticamente para long-polling - o chat continua funcionando.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
})
export const functions = getFunctions(app, 'southamerica-east1')
export const googleProvider = new GoogleAuthProvider()

/**
 * Emuladores locais, so em desenvolvimento e so quando pedido.
 *
 * Serve para abrir as telas logadas sem tocar em dado de producao -
 * conferir uma tela de verdade exige ver a tela cheia, nao uma
 * simulacao. Nunca liga sozinho: depende de VITE_USE_EMULATORS no
 * .env.local, e o servidor de dev precisa ser reiniciado depois de
 * mexer nessa variavel (o Vite le o env so no start).
 */
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
  // O HMR reexecuta este módulo, e ligar o emulador duas vezes joga
  // (auth/emulator-config-failed). Sem o try, o erro derrubava a
  // ligação inteira e o app voltava a falar com PRODUÇÃO em silêncio.
  try { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }) } catch { /* já ligado */ }
  try { connectFirestoreEmulator(db, '127.0.0.1', 8099) } catch { /* já ligado */ }
  console.info('[firebase] usando emuladores locais')
}

export default app
