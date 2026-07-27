import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { featuredBadgeSlots, levelFromXp } from '../utils/levels'
import { kesirano } from '../utils/kesSadrzaja'

// Servis za bedževe (achievements).
// Definicije žive u Firestore 'badges' kolekciji (admin skripta postavi-bedzeve.js),
// a osvojeni bedževi u users/{uid}.badges ({ badgeId: timestamp }) — upisuje ih
// isključivo server (Cloud Functions). Klijent samo čita i prikazuje.

// Sve aktivne bedževe, sortirane po redoslijedu prikaza.
// Keširano po sesiji (definicije se rijetko mijenjaju) — štedi Firestore reads.
let badgesPromise = null
export function getBadges() {
  if (!badgesPromise) {
    badgesPromise = fetchBadges().catch((e) => {
      badgesPromise = null
      throw e
    })
  }
  return badgesPromise
}

// Emojiji bedževa koje je igrač istakao na avataru — koristi ih i vlastiti i
// javni profil, pa filter mora živjeti na jednom mjestu.
//
// Filtrira se i pri ČITANJU, ne samo pri upisu: broj mjesta ovisi o levelu, a
// osvojeni bedževi dolaze sa servera. Igrač koji je istakao tri bedža ne smije
// zadržati sva tri ako lista bedževa ili pravila levela ikad odu unazad.
export function featuredBadgeEmojis(profile, badges) {
  const byId = new Map((badges || []).map((b) => [b.id, b]))
  const earned = profile?.badges || {}
  return (profile?.featuredBadges || [])
    .filter((id) => earned[id])
    .slice(0, featuredBadgeSlots(levelFromXp(profile?.xp)))
    .map((id) => byId.get(id)?.emoji)
    .filter(Boolean)
}

// Keširano u localStorage uz config/content.version (ranije 14 čitanja po
// otvaranju aplikacije).
function fetchBadges() {
  return kesirano('badges', dovuciBedzeve)
}

async function dovuciBedzeve() {
  const snap = await getDocs(query(collection(db, 'badges'), where('active', '==', true)))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0))
}
