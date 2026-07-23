import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database'
import { rtdb } from '../firebase'
import { weeklyKey } from '../utils/periods'

// Leaderboard servis (Modul 7 / Etapa 6) — klijent SAMO ČITA.
// Sve upise radi server (Cloud Functions): globalni unos preko triggera na
// promjenu profila, sedmični pri završetku kviza i preuzimanju nagrade.
// Struktura:
//   leaderboard/global/{uid}            → { name, avatar, level, xp, streak }
//   leaderboard/weekly/{sedmica}/{uid}  → isto, ali xp = XP osvojen te sedmice

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
