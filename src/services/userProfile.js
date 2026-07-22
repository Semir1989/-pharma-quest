import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { DEFAULT_AVATAR } from '../data/avatars'

// Kreira 'users' dokument za korisnika (pri registraciji ili dovršetku profila).
export async function createUserProfile(uid, { email, displayName, avatar }) {
  await setDoc(
    doc(db, 'users', uid),
    {
      email,
      displayName: displayName || 'Farmaceut',
      avatar: avatar || DEFAULT_AVATAR,
      xp: 0,
      level: 1,
      streak: 0,
      clan: null,
      accuracyByCategory: {},
      createdAt: serverTimestamp(),
    },
    { merge: true }
  )
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? snap.data() : null
}

export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, 'users', uid), data)
}
