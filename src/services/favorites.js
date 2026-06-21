/**
 * favorites.js — Favoritar VETERINÁRIOS (não solicitações).
 * Armazenado como array de uids em users/{uid}.favorites.
 */
import { doc, setDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

export async function toggleFavorite(userUid, professionalUid, isFav) {
  await setDoc(doc(db, 'users', userUid), {
    favorites: isFav ? arrayRemove(professionalUid) : arrayUnion(professionalUid),
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return !isFav
}
