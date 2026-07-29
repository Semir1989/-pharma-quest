import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database'
import { doc, onSnapshot } from 'firebase/firestore'
import { rtdb, db } from '../firebase'
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

// --- Prozor eventa (config/survival) ---
//
// Ikonica Arene mora znati je li event otvoren UPRAVO SADA, a ne kakav je bio
// kad se aplikacija učitala: u srijedu u 08:00 se otvara sam i signal mora
// zasvijetliti bez reloada. Zato živa pretplata umjesto jednokratnog čitanja
// (kao getTournamentConfig). Listener je jedan po sesiji koliko god komponenti
// ga tražilo, a posljednja vrijednost se pamti da novi pretplatnik ne čeka.
let cfgVrijednost // undefined = još se učitava, null = doc ne postoji
let cfgUnsub = null
const cfgPretplatnici = new Set()

export function subscribeSurvivalConfig(callback) {
  cfgPretplatnici.add(callback)
  if (cfgVrijednost !== undefined) callback(cfgVrijednost)
  if (!cfgUnsub) {
    const javi = (v) => {
      cfgVrijednost = v
      for (const fn of cfgPretplatnici) fn(v)
    }
    cfgUnsub = onSnapshot(
      doc(db, 'config', 'survival'),
      (snap) => javi(snap.exists() ? snap.data() : null),
      () => javi(null)
    )
  }
  return () => {
    cfgPretplatnici.delete(callback)
    if (cfgPretplatnici.size === 0 && cfgUnsub) {
      cfgUnsub()
      cfgUnsub = null
      cfgVrijednost = undefined
    }
  }
}

// --- Rekord: najbolji niz IKAD (config/survivalRecord) ---
//
// Stalna kartica iznad sedmične ljestvice — pokazuje jedno mjesto i ne
// resetuje se srijedom. Upisuje ga server poslije svakog odgovora
// (updateSurvivalRecord); klijent samo čita, živo, da se smjena rekordera vidi
// bez reloada.
export function subscribeSurvivalRecord(callback) {
  return onSnapshot(
    doc(db, 'config', 'survivalRecord'),
    (snap) => callback(snap.exists() ? snap.data() : null),
    () => callback(null)
  )
}

// Je li prozor eventa otvoren. Isto pravilo kao na serveru
// (survivalWindowClosed): nema config-a ili enabled=false → nema gejta.
export function survivalOpen(cfg, now = Date.now()) {
  if (!cfg || !cfg.enabled) return true
  if (cfg.openAt && now < cfg.openAt) return false
  if (cfg.closeAt && now > cfg.closeAt) return false
  return true
}
