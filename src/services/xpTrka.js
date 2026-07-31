import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database'
import { doc, getDoc } from 'firebase/firestore'
import { rtdb, db } from '../firebase'

// XP TRKA — zaseban event od 1v1 arene.
//
// Do sada su dijelili config/tournament i istu stranicu, pa se trka nije mogla
// ni produžiti ni ugasiti bez diranja duela, a klik na trku je vodio na bracket.
// Sada trka ima svoj prozor (config/xpRace) i svoju ljestvicu (/xp-trka).
//
// Klijent SAMO ČITA; XP sabira server (addWeekendXp) na tournament/{key}/{uid}.
// RTDB putanja je namjerno ostala ista — pod njom već stoje rezultati tekućeg
// eventa, a preseljenje bi ih bacilo.

// Dok admin ne postavi vlastiti prozor, trka pada nazad na prozor turnira —
// isto pravilo kao na serveru, da klijent i server ne vide različit event.
let cache = null

export async function getXpRaceConfig() {
  if (cache) return cache
  const snap = await getDoc(doc(db, 'config', 'xpRace'))
  if (snap.exists()) {
    cache = snap.data()
  } else {
    const t = await getDoc(doc(db, 'config', 'tournament'))
    cache = t.exists() ? t.data() : null
  }
  return cache
}

export function invalidateXpRaceConfig() {
  cache = null
}

// Je li trka trenutno otvorena.
export function xpTrkaUToku(cfg, now = Date.now()) {
  if (!cfg?.enabled || !cfg.key) return false
  return now >= (cfg.openAt || 0) && now <= (cfg.closeAt || 0)
}

// Faza trke za prikaz: prije / u toku / završena / ugašena.
export function xpTrkaFaza(cfg, now = Date.now()) {
  if (!cfg?.enabled || !cfg.key) return 'off'
  if (now < cfg.openAt) return 'pre'
  if (now <= cfg.closeAt) return 'live'
  return 'ended'
}

// Živa ljestvica trke — vraća unsubscribe. Poredak je opadajući po XP-u.
export function subscribeXpTrka(key, callback, koliko = 100) {
  if (!key) {
    callback([])
    return () => {}
  }
  const q = query(ref(rtdb, `tournament/${key}`), orderByChild('xp'), limitToLast(koliko))
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

// Rezultati i nagrade poslije finalizacije — { finalized, top: [...] }.
export async function getXpTrkaRezultat(key) {
  if (!key) return null
  const snap = await getDoc(doc(db, 'xpRaces', key))
  return snap.exists() ? snap.data() : null
}
