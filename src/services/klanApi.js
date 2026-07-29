import { httpsCallable } from 'firebase/functions'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { functions, db } from '../firebase'
import { track } from './analytics'

// Klanovi — svi upisi idu kroz Cloud Functions. Klijent po firestore.rules ne
// može pisati ni u jednu klansku kolekciju, pa je ovdje samo poziv i čitanje.

const PROLAZNE = ['internal', 'unavailable', 'deadline-exceeded', 'aborted', 'cancelled']

function kodGreske(e) {
  return String(e?.code || 'nepoznato').replace(/^functions\//, '')
}

// Isti omotač kao u quizApi: greška se bilježi, a ponavlja se SAMO ono što je
// bezopasno ponoviti. Ovdje se ponavljaju isključivo čitanja — svaka promjena
// članstva se ponovljenim pozivom može desiti dvaput (npr. dvostruko slanje
// zahtjeva ili odobrenje igrača koji je u međuvremenu izašao).
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

export const getClanOverview = poziv(
  'getClanOverview',
  httpsCallable(functions, 'getClanOverview'),
  { ponovi: true }
)
export const getClanPlayerDetails = poziv(
  'getClanPlayerDetails',
  httpsCallable(functions, 'getClanPlayerDetails'),
  { ponovi: true }
)
// Javni prikaz bilo kojeg klana (sastav + osnovni podaci) — vidi ga svako, ne
// samo članovi tog klana.
export const getClanDetails = poziv(
  'getClanDetails',
  httpsCallable(functions, 'getClanDetails'),
  { ponovi: true }
)

export const createClan = poziv('createClan', httpsCallable(functions, 'createClan'))
export const requestJoinClan = poziv('requestJoinClan', httpsCallable(functions, 'requestJoinClan'))
export const approveJoinRequest = poziv('approveJoinRequest', httpsCallable(functions, 'approveJoinRequest'))
export const rejectJoinRequest = poziv('rejectJoinRequest', httpsCallable(functions, 'rejectJoinRequest'))
export const leaveClan = poziv('leaveClan', httpsCallable(functions, 'leaveClan'))
export const kickMember = poziv('kickMember', httpsCallable(functions, 'kickMember'))
export const assignAdvisor = poziv('assignAdvisor', httpsCallable(functions, 'assignAdvisor'))
export const removeAdvisor = poziv('removeAdvisor', httpsCallable(functions, 'removeAdvisor'))
export const disbandClan = poziv('disbandClan', httpsCallable(functions, 'disbandClan'))
export const registerForCompetition = poziv(
  'registerForCompetition',
  httpsCallable(functions, 'registerForCompetition')
)

// Popis klanova za ekran "Pronađi klan". Čita se direktno iz Firestorea —
// clans/* je po pravilima read-only za prijavljene, pa pretraga ne troši
// nijedan poziv funkcije. Sortiranje ide u memoriji: klanova je malo, a
// where + orderBy nad različitim poljima bi tražio složeni indeks.
export async function pretraziKlanove() {
  const snap = await getDocs(query(collection(db, 'clans'), where('disbandedAt', '==', null)))
  return snap.docs
    .map((d) => {
      const c = d.data()
      return {
        id: d.id,
        name: c.name,
        tag: c.tag || null,
        memberCount: (c.memberIds || []).length,
        // Cijela lista, ne samo broj: igraču treba pokazati da je SVOJ zahtjev
        // već poslao, inače ga šalje ponovo i dobija grešku.
        pendingRequests: c.pendingRequests || [],
        clanLevel: c.clanLevel || 1,
        clanXP: c.clanXP || 0,
        createdAt: c.createdAt?.toMillis?.() || 0,
      }
    })
    .sort((a, b) => b.memberCount - a.memberCount || b.createdAt - a.createdAt)
}
