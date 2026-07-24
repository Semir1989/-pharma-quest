import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'

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

async function fetchBadges() {
  const snap = await getDocs(query(collection(db, 'badges'), where('active', '==', true)))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0))
}
