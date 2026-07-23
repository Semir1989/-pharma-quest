import { ref, update, onValue, query, orderByChild, limitToLast, increment } from 'firebase/database'
import { rtdb } from '../firebase'
import { weeklyKey } from '../utils/periods'
import { levelFromXp } from '../utils/levels'

// Leaderboard servis (Modul 7) — Realtime Database za live rezultate.
// Struktura:
//   leaderboard/global/{uid}            → { name, avatar, level, xp, streak }
//   leaderboard/weekly/{sedmica}/{uid}  → isto, ali xp = XP osvojen te sedmice
// Upis: svaki korisnik piše samo svoj unos (vidi RTDB pravila).
// NAPOMENA: privremeno s klijenta — u Etapi 6 seli na Cloud Functions.

function entryFrom(profile, level) {
  return {
    name: profile.displayName || 'Farmaceut',
    avatar: profile.avatar || 'a1',
    level,
    streak: profile.streak || 0,
  }
}

// Globalni unos = ukupni XP iz profila. Poziva se pri svakoj promjeni profila.
export function syncGlobalEntry(uid, profile) {
  if (!uid || !profile) return
  update(ref(rtdb, `leaderboard/global/${uid}`), {
    ...entryFrom(profile, levelFromXp(profile.xp || 0)),
    xp: profile.xp || 0,
  }).catch(() => {}) // leaderboard nikad ne smije srušiti glavnu radnju
}

// Sedmični unos — uvećava XP tekuće sedmice (poslije kviza ili preuzete nagrade).
export function addWeeklyXp(uid, profile, delta) {
  if (!uid || !profile || !delta || delta <= 0) return
  update(ref(rtdb, `leaderboard/weekly/${weeklyKey()}/${uid}`), {
    ...entryFrom(profile, levelFromXp((profile.xp || 0) + delta)),
    xp: increment(delta),
  }).catch(() => {})
}

// Live praćenje liste ('global' ili 'weekly') — vraća unsubscribe funkciju.
export function subscribeLeaderboard(scope, callback) {
  const path = scope === 'weekly' ? `leaderboard/weekly/${weeklyKey()}` : 'leaderboard/global'
  const q = query(ref(rtdb, path), orderByChild('xp'), limitToLast(50))
  return onValue(
    q,
    (snap) => {
      const rows = []
      snap.forEach((child) => {
        rows.push({ uid: child.key, ...child.val() })
      })
      rows.reverse() // limitToLast vraća rastuće — želimo najboljeg prvog
      callback(rows)
    },
    () => callback([])
  )
}
