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

// Istaknuti bedževi — oni koji se vide na avataru drugim igračima.
// Čisto kozmetika: nagrade (XP, bedževe) i dalje dodjeljuje isključivo server,
// ovo je samo izbor ŠTA se od već osvojenog pokazuje. Zato je polje otvoreno
// klijentu u firestore.rules, ali pravila provjeravaju da su svi id-evi iz
// vlastite mape osvojenih bedževa i da ih nije više od tri.
export async function updateFeaturedBadges(uid, badgeIds) {
  await updateDoc(doc(db, 'users', uid), { featuredBadges: badgeIds })
}

// Ukras koji igrač nosi na jednom od tri mjesta: 'ring' | 'background' | 'aura'.
// Piše se SAMO ta jedna putanja — lista osvojenih (cosmetics.owned) nikad ne
// ide s klijenta, pa je ne može ni slučajno prepisati. Pravila povrh toga traže
// da je ukras iz vlastite liste.
export async function equipCosmetic(uid, kind, id) {
  await updateDoc(doc(db, 'users', uid), { [`cosmetics.${kind}`]: id || null })
}

// Pamti da je igrač OTVORIO kovčeg na ljestvici Preživljavanja.
// Nije XP polje — bonus isplaćuje server u istom trenutku kad niz dostigne
// prag (submitSurvivalAnswer); ovo samo bilježi da je animaciju vidio, da mu
// se ne nudi ponovo. Zato je jedino ovo polje uz displayName/avatar otvoreno
// klijentu u firestore.rules: falsifikovanje ne donosi nikakav XP.
// Uz prag se pamti i sedmica, jer se nizovi (pa i kovčezi) resetuju srijedom.
export async function markSurvivalChestOpened(uid, week, step) {
  await updateDoc(doc(db, 'users', uid), { survivalChest: { week, opened: step } })
}
