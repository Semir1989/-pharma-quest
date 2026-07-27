import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { setLevelConfig } from '../utils/levels'
import { kesirano } from '../utils/kesSadrzaja'

// Učitava parametre XP krive iz Firestore (config/levels) — Modul 5.
// Ako dokument ne postoji ili učitavanje ne uspije, ostaju defaulti iz levels.js.
// Poziva se jednom nakon prijave (vidi AuthContext).
let loaded = false

export async function loadLevelConfig() {
  if (loaded) return
  try {
    // Keširano u localStorage uz config/content.version — XP kriva se mijenja
    // samo admin skriptom, a čitala se pri svakoj prijavi.
    const cfg = await kesirano('levels', async () => {
      const snap = await getDoc(doc(db, 'config', 'levels'))
      return snap.exists() ? snap.data() : null
    })
    if (cfg) {
      setLevelConfig(cfg)
      loaded = true
    }
  } catch {
    // Nema veze — koriste se default vrijednosti.
  }
}
