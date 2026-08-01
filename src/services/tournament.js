import { doc, getDoc, getCountFromServer, collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

// 1v1 DUEL TURNIR — prozor i ključ eventa žive u Firestore config/tournament,
// bracket u tournaments/{key}. Klijent SAMO ČITA.
//
// XP trka je od 31.07.2026. zaseban event sa svojim servisom
// (services/xpTrka.js) — ovdje je nema, iako su do tada dijelile ovaj config.

// Koliko tačnih treba igraču bez protivnika (u rundi poslije prve) da prođe
// dalje. MORA pratiti KVALIFIKACIJA_PRAG iz functions/duel-pravila.js —
// server je jedini koji odlučuje, ovo je samo za tekst na ekranu.
export const KVALIFIKACIJA_PRAG = 6

// Config čitaju i Arena (kartica duela) i /turnir, pa se drži u kešu za sesiju
// — isti pristup kao getTasks/getBadges. Admin izmjena prozora vidi se poslije
// reloada.
let configCache = null

export async function getTournamentConfig() {
  if (configCache) return configCache
  const snap = await getDoc(doc(db, 'config', 'tournament'))
  configCache = snap.exists() ? snap.data() : null
  return configCache
}

// Admin panel je zove poslije izmjene prozora — bez toga bi admin do reloada
// gledao stari config i mislio da izmjena nije prošla.
export function invalidateTournamentConfig() {
  configCache = null
}

// Jesam li prijavljen za duel turnir — jedan read vlastitog dokumenta
// (ne cijele kolekcije učesnika, koja treba samo ekranu /turnir).
export async function isRegisteredForDuel(tid, uid) {
  if (!tid || !uid) return false
  try {
    const snap = await getDoc(doc(db, 'tournaments', tid, 'participants', uid))
    return snap.exists()
  } catch {
    return false
  }
}

// Broj prijavljenih — agregacija, ne povlači dokumente.
export async function countDuelParticipants(tid) {
  if (!tid) return 0
  try {
    return (await getCountFromServer(collection(db, 'tournaments', tid, 'participants'))).data().count
  } catch {
    return 0
  }
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
