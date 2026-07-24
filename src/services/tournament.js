import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database'
import { doc, getDoc } from 'firebase/firestore'
import { rtdb, db } from '../firebase'

// Vikend turnir — XP trka (Faza 2, korak B). Klijent SAMO ČITA; XP sabira server.
// Prozor i ključ eventa žive u Firestore config/tournament; leaderboard u RTDB
// tournament/{key}/{uid} → { name, avatar, xp }.

export async function getTournamentConfig() {
  const snap = await getDoc(doc(db, 'config', 'tournament'))
  return snap.exists() ? snap.data() : null
}

// Live praćenje turnirske liste za dati ključ — vraća unsubscribe funkciju.
export function subscribeTournamentLeaderboard(key, callback) {
  if (!key) {
    callback([])
    return () => {}
  }
  const q = query(ref(rtdb, `tournament/${key}`), orderByChild('xp'), limitToLast(50))
  return onValue(
    q,
    (snap) => {
      const rows = []
      snap.forEach((child) => rows.push({ uid: child.key, ...child.val() }))
      rows.reverse()
      callback(rows)
    },
    () => callback([])
  )
}
