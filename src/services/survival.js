import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database'
import { rtdb } from '../firebase'
import { survivalWeekKey } from '../utils/periods'

// Leaderboard Preživljavanja (Etapa 8) — klijent SAMO ČITA; upisuje server.
// Struktura: survival/{sedmica}/{uid} → { name, avatar, streak }
// Sedmica se resetuje srijedom (survivalWeekKey).

// Vlastiti niz u tekućoj sedmici — za ljestvicu s kovčezima.
// Čita se iz istog RTDB čvora koji server upisuje poslije svakog odgovora
// (writeSurvivalLeaderboard), pa je tačan i prije ulaska u izazov i poslije
// izlaska. Nema unosa = igrač ove sedmice još nije igrao → niz 0.
export function subscribeMyStreak(uid, callback) {
  if (!uid) return () => {}
  return onValue(
    ref(rtdb, `survival/${survivalWeekKey()}/${uid}/streak`),
    (snap) => callback(snap.val() || 0),
    () => callback(0)
  )
}

// Live praćenje liste za tekuću sedmicu — vraća unsubscribe funkciju.
export function subscribeSurvivalLeaderboard(callback) {
  const q = query(ref(rtdb, `survival/${survivalWeekKey()}`), orderByChild('streak'), limitToLast(50))
  return onValue(
    q,
    (snap) => {
      const rows = []
      // PAŽNJA: DataSnapshot.forEach prekida obilazak čim callback vrati nešto
      // istinito. Skraćeni zapis `(c) => rows.push(...)` vraća novu dužinu niza
      // (1), pa se lista zaustavljala na PRVOM igraču. Tijelo mora biti u
      // vitičastim zagradama da vrati undefined.
      snap.forEach((child) => {
        rows.push({ uid: child.key, ...child.val() })
      })
      rows.reverse() // limitToLast vraća rastuće — želimo najboljeg prvog
      callback(rows)
    },
    () => callback([])
  )
}
