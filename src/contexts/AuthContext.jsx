import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  getAdditionalUserInfo,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase'
import { clearRoleCache } from '../services/userRole'
import { clearUserStorage } from '../services/userStorage'
import { registrarOrigem } from '../services/origem'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  function clearError() { setError(null) }

  async function loginWithEmail(email, password) {
    try {
      setIsProcessing(true)
      setError(null)
      const cred = await signInWithEmailAndPassword(auth, email, password)
      return cred.user
    } catch (e) {
      setError(translateFirebaseError(e.code))
      return null
    } finally {
      setIsProcessing(false)
    }
  }

  async function registerWithEmail(email, password, name = '') {
    try {
      setIsProcessing(true)
      setError(null)
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      const cleanName = name.trim()
      if (cleanName) {
        await updateProfile(cred.user, { displayName: cleanName }).catch(() => {})
      }
      // Uma conta sem este documento existe no Authentication e não
      // existe no app. Se a gravação falhar, a conta é DESFEITA: sem
      // isso a pessoa ficava presa, porque tentar de novo dava "email já
      // em uso" e entrar levava a uma conta vazia.
      try {
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          email: cred.user.email,
          name: cleanName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
      } catch (e) {
        console.error('[cadastro] documento do usuário:', e)
        await deleteUser(cred.user).catch(() => {})
        setError('Não foi possível concluir o cadastro. Tente novamente.')
        return null
      }
      await registrarOrigem(cred.user.uid)
      // O e-mail de verificação não decide o cadastro: falhar aqui
      // (limite de envio, por exemplo) não pode parecer conta não criada.
      await sendEmailVerification(cred.user)
        .catch(e => console.error('[cadastro] e-mail de verificação:', e))
      return cred.user
    } catch (e) {
      setError(translateFirebaseError(e.code))
      return null
    } finally {
      setIsProcessing(false)
    }
  }

  async function loginWithGoogle() {
    try {
      setIsProcessing(true)
      setError(null)
      const cred = await signInWithPopup(auth, googleProvider)
      // Primeiro login pelo Google É o cadastro. Antes nada era gravado
      // aqui: a conta ficava sem createdAt (sumia dos "novos em 30
      // dias" do admin), sem origem e sem a indicação de quem convidou.
      if (getAdditionalUserInfo(cred)?.isNewUser) {
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          email: cred.user.email,
          name: cred.user.displayName || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true }).catch(e => console.error('[auth] doc do usuário Google:', e))
        await registrarOrigem(cred.user.uid)
      }
      return cred.user
    } catch (e) {
      setError(translateFirebaseError(e.code))
      return null
    } finally {
      setIsProcessing(false)
    }
  }

  async function logout() {
    await signOut(auth)
    clearRoleCache()
    // Apaga conversas da IA, tutoriais e avisos dispensados. Sem isso,
    // quem entrasse depois no mesmo navegador via os dados do anterior.
    clearUserStorage()
    setUser(null)
    setError(null)
  }

  async function resetPassword(email) {
    try {
      setIsProcessing(true)
      setError(null)
      await sendPasswordResetEmail(auth, email)
      return true
    } catch (e) {
      setError(translateFirebaseError(e.code))
      return false
    } finally {
      setIsProcessing(false)
    }
  }

  async function updateFirestoreUser(fields) {
    if (!user) return false
    try {
      await setDoc(doc(db, 'users', user.uid), {
        ...fields,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      return true
    } catch (e) {
      setError(e.message)
      return false
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error,
      isProcessing,
      isLoggedIn: !!user,
      clearError,
      loginWithEmail,
      registerWithEmail,
      loginWithGoogle,
      logout,
      resetPassword,
      updateFirestoreUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

function translateFirebaseError(code) {
  const map = {
    'auth/user-not-found': 'Usuário não encontrado.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/email-already-in-use': 'Este email já está em uso.',
    'auth/weak-password': 'Senha muito fraca. Mínimo 6 caracteres.',
    'auth/invalid-email': 'Email inválido.',
    'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
    'auth/popup-closed-by-user': 'Login cancelado.',
    'auth/invalid-credential': 'Email ou senha incorretos.',
  }
  return map[code] || 'Erro ao autenticar. Tente novamente.'
}
