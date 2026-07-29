import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { track } from './analytics'

// Klanski rat i Zeleni Okrug. Sve ide kroz Cloud Functions — klijent po
// firestore.rules ne može pisati ni u jednu klansku kolekciju, a živo bodovanje
// je u RTDB-u koji klijent ne čita direktno.

const PROLAZNE = ['internal', 'unavailable', 'deadline-exceeded', 'aborted', 'cancelled']

function kodGreske(e) {
  return String(e?.code || 'nepoznato').replace(/^functions\//, '')
}

// Isti omotač kao u quizApi/klanApi: ponavlja se SAMO ono što je bezopasno
// ponoviti. Ulaganje u gradnju, pokretanje i zatvaranje rata se NIKAD ne
// ponavljaju — dvostruko ulaganje bi skinulo bodove dvaput, a dvostruko
// zatvaranje rata je najgora greška koju ovaj sistem može napraviti.
function poziv(ime, fn, { ponovi = false } = {}) {
  return async (payload = {}) => {
    try {
      return (await fn(payload)).data
    } catch (e) {
      const kod = kodGreske(e)
      console.error(`[callable] ${ime} → ${kod}`, e?.message || '')
      track('callable_error', { fn: ime, code: kod, retried: ponovi && PROLAZNE.includes(kod) })
      if (!ponovi || !PROLAZNE.includes(kod)) throw e
      await new Promise((r) => setTimeout(r, 600))
      return (await fn(payload)).data
    }
  }
}

// --- Igrači ---------------------------------------------------------------
export const getClanWar = poziv('getClanWar', httpsCallable(functions, 'getClanWar'), {
  ponovi: true,
})
export const startBuild = poziv('startBuild', httpsCallable(functions, 'startBuild'))
export const contributeToBuild = poziv(
  'contributeToBuild',
  httpsCallable(functions, 'contributeToBuild')
)
export const cancelBuild = poziv('cancelBuild', httpsCallable(functions, 'cancelBuild'))

// 50:50 iz Kliničke Apoteke. Ponovljiv: server pamti koje je odgovore sakrio za
// to pitanje i drugi poziv ne troši novu upotrebu.
export const useHint = poziv('useHint', httpsCallable(functions, 'useHint'), { ponovi: true })

// --- Admin ----------------------------------------------------------------
export const adminWarStatus = poziv('adminWarStatus', httpsCallable(functions, 'adminWarStatus'), {
  ponovi: true,
})
export const adminWarCreate = poziv('adminWarCreate', httpsCallable(functions, 'adminWarCreate'))
export const adminWarStart = poziv('adminWarStart', httpsCallable(functions, 'adminWarStart'))
export const adminWarEnd = poziv('adminWarEnd', httpsCallable(functions, 'adminWarEnd'))
export const adminWarPause = poziv('adminWarPause', httpsCallable(functions, 'adminWarPause'))
export const adminWarCancel = poziv('adminWarCancel', httpsCallable(functions, 'adminWarCancel'))
export const adminWarSetConfig = poziv(
  'adminWarSetConfig',
  httpsCallable(functions, 'adminWarSetConfig')
)
export const adminWarRecomputeDay = poziv(
  'adminWarRecomputeDay',
  httpsCallable(functions, 'adminWarRecomputeDay')
)
export const adminWarSetOkrug = poziv(
  'adminWarSetOkrug',
  httpsCallable(functions, 'adminWarSetOkrug')
)
