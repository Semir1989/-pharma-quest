import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { DEFAULT_AVATAR } from '../data/avatars'

// Kreira 'users' dokument za korisnika (pri registraciji ili dovršetku profila).
// Napomena (Etapa 6): stroga pravila dozvoljavaju klijentu da KREIRA profil
// (xp mora biti 0), a poslije smije mijenjati samo displayName i avatar —
// zato, ako dokument već postoji, ažuriramo samo ta dva polja.
export async function createUserProfile(uid, { email, displayName, avatar }) {
  const ref = doc(db, 'users', uid)
  const existing = await getDoc(ref)

  if (existing.exists()) {
    await updateDoc(ref, {
      displayName: displayName || existing.data().displayName || 'Farmaceut',
      avatar: avatar || existing.data().avatar || DEFAULT_AVATAR,
    })
    return
  }

  await setDoc(ref, {
    email,
    displayName: displayName || 'Farmaceut',
    avatar: avatar || DEFAULT_AVATAR,
    xp: 0,
    level: 1,
    streak: 0,
    clan: null,
    accuracyByCategory: {},
    createdAt: serverTimestamp(),
  })
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? snap.data() : null
}

// Ažuriranje profila — dozvoljena su samo polja displayName i avatar.
export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, 'users', uid), data)
}
