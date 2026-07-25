import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database'
import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore'
import { rtdb, db } from '../firebase'

// Vikend turnir — XP trka (Faza 2, korak B). Klijent SAMO ČITA; XP sabira server.
// Prozor i ključ eventa žive u Firestore config/tournament; leaderboard u RTDB
// tournament/{key}/{uid} → { name, avatar, xp }.

export async function getTournamentConfig() {
  const snap = await getDoc(doc(db, 'config', 'tournament'))
  return snap.exists() ? snap.data() : null
}

// Rezultati/nagrade XP trke (poslije finalizacije) — { finalized, top: [...] }.
export async function getXpRace(tid) {
  if (!tid) return null
  const snap = await getDoc(doc(db, 'xpRaces', tid))
  return snap.exists() ? snap.data() : null
}

// --- Duel turnir (Faza 2, korak C) ---

// Live praćenje turnir doc-a (status, currentRound, rounds, winnerUid...).
export function subscribeTournament(tid, callback) {
  if (!tid) { callback(null); return () => {} }
  return onSnapshot(doc(db, 'tournaments', tid), (snap) => callback(snap.exists() ? snap.data() : null), () => callback(null))
}

// Live praćenje učesnika — mapa { uid: { name, avatar } }.
export function subscribeParticipants(tid, callback) {
  if (!tid) { callback({}); return () => {} }
  return onSnapshot(
    collection(db, 'tournaments', tid, 'participants'),
    (snap) => {
      const map = {}
      snap.forEach((d) => (map[d.id] = d.data()))
      callback(map)
    },
    () => callback({})
  )
}

// Live praćenje mečeva (bracket).
export function subscribeMatches(tid, callback) {
  if (!tid) { callback([]); return () => {} }
  return onSnapshot(
    collection(db, 'tournaments', tid, 'matches'),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback([])
  )
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
      // Tijelo MORA biti u vitičastim zagradama: forEach prekida obilazak čim
      // callback vrati nešto istinito, a rows.push vraća dužinu niza (1).
      snap.forEach((child) => {
        rows.push({ uid: child.key, ...child.val() })
      })
      rows.reverse()
      callback(rows)
    },
    () => callback([])
  )
}
