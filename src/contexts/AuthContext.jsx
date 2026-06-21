import { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  deleteUser,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase'
import { clearRoleCache } from '../services/userRole'

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
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          email: cred.user.email,
          name: cleanName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true }).catch(() => {})
      }
      await sendEmailVerification(cred.user)
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
