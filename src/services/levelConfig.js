import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { setLevelConfig } from '../utils/levels'

// Učitava parametre XP krive iz Firestore (config/levels) — Modul 5.
// Ako dokument ne postoji ili učitavanje ne uspije, ostaju defaulti iz levels.js.
// Poziva se jednom nakon prijave (vidi AuthContext).
let loaded = false

export async function loadLevelConfig() {
  if (loaded) return
  try {
    const snap = await getDoc(doc(db, 'config', 'levels'))
    if (snap.exists()) {
      setLevelConfig(snap.data())
      loaded = true
    }
  } catch {
    // Nema veze — koriste se default vrijednosti.
  }
}
