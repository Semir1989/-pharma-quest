import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging'
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { app, db } from '../firebase'
import { track } from './analytics'

// ---------------------------------------------------------------------------
// Push notifikacije (F2.2)
//
// Token se čuva u users/{uid}.fcmTokens (LISTA — isti igrač ima telefon i
// desktop, i svaki uređaj ima svoj token). Server šalje na sve tokene i sam
// briše one koje FCM odbije.
//
// iOS: web push radi ISKLJUČIVO ako je aplikacija instalirana na početni ekran
// (iOS 16.4+). U Safariju kao običnoj kartici Notification API ne postoji i
// nikakvim kodom se to ne može zaobići. Zato stanje() to razlikuje i vraća
// 'ios-nije-instalirana' umjesto da tiho javi "nepodržano" — igrač treba znati
// da mu fali JEDAN korak, a ne da mu uređaj ne može.
// ---------------------------------------------------------------------------

const VAPID = import.meta.env.VITE_FIREBASE_VAPID_KEY
const SW_URL = '/push-sw.js'
// Aplikacija već ima service worker (vite-plugin-pwa) na scope-u '/'.
// Dva SW-a ne mogu dijeliti scope, pa push ide u svoj.
const SW_SCOPE = '/push-scope'

export const TIPOVI = {
  najave: { label: 'Objave', opis: 'Poruke od administratora igre' },
  dnevni: { label: 'Dnevni kviz', opis: 'Ujutro i uveče, ako taj dan nisi igrao' },
  streak: { label: 'Niz u opasnosti', opis: 'Kad ti niz ističe, a nisi igrao' },
  survival: { label: 'Preživljavanje', opis: 'Novi sedmični pokušaj (srijeda)' },
  turnir: { label: 'Turniri', opis: 'Otvaranje prijava i početak duela' },
  energija: { label: 'Povratak', opis: 'Ako te nema nekoliko dana' },
}

export const PODRAZUMIJEVANE_POSTAVKE = Object.fromEntries(
  Object.keys(TIPOVI).map((k) => [k, true])
)

const jeIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const instaliranaKaoPWA = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

/**
 * Stanje notifikacija na ovom uređaju:
 *   'nema-kljuca'          — VITE_FIREBASE_VAPID_KEY nije postavljen (setup nije završen)
 *   'ios-nije-instalirana' — iPhone/iPad, ali aplikacija nije na početnom ekranu
 *   'nepodrzano'           — browser nema push (stari Android browser, itd.)
 *   'blokirano'            — korisnik je odbio dozvolu (mora ručno u postavkama)
 *   'iskljuceno'           — sve radi, samo ovaj uređaj još nije povezan
 *   'ukljuceno'            — dozvola data I token ovog uređaja je spremljen
 *
 * 'ukljuceno' NAMJERNO ne znači samo "dozvola je data". Dozvola ostaje u
 * browseru i poslije isključivanja, pa bi ekran pokazivao da je sve uključeno
 * dok se poruke stvarno ne šalju nikome — a dugme bi nudilo samo "Isključi", i
 * uređaj se ne bi imao kako vratiti. Mjerodavno je ono što stoji u bazi.
 */
export async function stanje(profile) {
  if (!VAPID) return 'nema-kljuca'
  if (jeIOS() && !instaliranaKaoPWA()) return 'ios-nije-instalirana'
  if (!('Notification' in window) || !(await isSupported().catch(() => false))) return 'nepodrzano'
  if (Notification.permission === 'denied') return 'blokirano'
  if (Notification.permission !== 'granted') return 'iskljuceno'

  if (profile?.notifOn !== true) return 'iskljuceno'
  const token = await tokenOvogUredjaja()
  return token && (profile.fcmTokens || []).includes(token) ? 'ukljuceno' : 'iskljuceno'
}

/**
 * Tiha popravka pri otvaranju ekrana: ako je nalog pretplaćen, a token ovog
 * uređaja fali u bazi (FCM ga s vremenom rotira, a i stari pokvareni tokeni
 * ispadnu kad se pretplata veže za ispravan service worker), vrati ga.
 * Kad je notifOn false, ovdje se NIŠTA ne dira — to je izričito gašenje.
 */
export async function sinhronizuj(uid, profile) {
  if (!uid || profile?.notifOn !== true) return false
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  if (!(await nadjiPushRegistraciju())) return false

  const token = await tokenOvogUredjaja()
  if (!token || (profile.fcmTokens || []).includes(token)) return false

  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) }).catch(() => {})
  return true
}

// PAŽNJA: NE koristiti navigator.serviceWorker.getRegistration(SW_SCOPE).
// Taj poziv ne traži registraciju s TAČNO tim scope-om nego onu čiji scope
// POKRIVA dati URL — a PWA service worker na '/' pokriva i '/push-scope'. Zbog
// toga je vraćao workbox SW, push-sw.js se nikad nije registrovao, a getToken()
// je pretplatu vezao za service worker koji nema 'push' handler: token valjan,
// FCM javlja uspjeh, poruka stigne na uređaj i nestane bez prikaza.
const punScope = () => new URL(SW_SCOPE, self.location.origin).href

async function nadjiPushRegistraciju() {
  const sve = await navigator.serviceWorker.getRegistrations()
  return sve.find((r) => r.scope === punScope() || r.scope === punScope() + '/') || null
}

async function registrujSW() {
  const postojeca = await nadjiPushRegistraciju()
  if (postojeca) return postojeca
  return navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE })
}

// Token OVOG uređaja, bez traženja dozvole i bez ikakvog upisa. null ako uređaj
// nije (ispravno) povezan.
async function tokenOvogUredjaja() {
  if (!VAPID || typeof Notification === 'undefined') return null
  if (Notification.permission !== 'granted') return null
  const registracija = await nadjiPushRegistraciju()
  if (!registracija) return null
  return getToken(getMessaging(app), {
    vapidKey: VAPID,
    serviceWorkerRegistration: registracija,
  }).catch(() => null)
}

// Uključi notifikacije na OVOM uređaju. Vraća true ako je token spremljen.
export async function ukljuci(uid) {
  if (!uid || !VAPID) return false

  const dozvola = await Notification.requestPermission()
  if (dozvola !== 'granted') {
    track('notif_permission', { rezultat: dozvola })
    return false
  }

  const registracija = await registrujSW()
  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID,
    serviceWorkerRegistration: registracija,
  })
  if (!token) return false

  // arrayUnion → isti uređaj se ne duplira, a drugi uređaj se doda.
  // notifOn je zastavica po kojoj server filtrira koga uopšte čita (vidi
  // notifTick) — bez nje bi svaki tick prolazio kroz sve igrače.
  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token), notifOn: true })
  track('notif_permission', { rezultat: 'granted' })
  return true
}

// Isključi notifikacije. Skida token OVOG uređaja i gasi zastavicu za nalog —
// dakle prekid vrijedi za sve uređaje. Namjerno tako: "ugasi notifikacije" u
// postavkama treba značiti da ih stvarno nema, a ne da ih drugi uređaj i dalje
// prima bez načina da se to vidi na ovom ekranu.
export async function iskljuci(uid) {
  if (!uid) return

  // Token OVOG uređaja, ako se do njega može doći.
  let token = null
  try {
    const registracija = await nadjiPushRegistraciju()
    if (registracija) {
      token = await getToken(getMessaging(app), {
        vapidKey: VAPID,
        serviceWorkerRegistration: registracija,
      }).catch(() => null)
    }
  } catch {
    // Nema veze — gašenje zastavice ispod je ono što stvarno zaustavlja poruke.
  }

  // Zastavica se gasi UVIJEK, i onda kad se do tokena nije došlo. Inače bi
  // "isključi" tiho zakazalo, a igrač bi i dalje primao poruke.
  await updateDoc(doc(db, 'users', uid), {
    notifOn: false,
    ...(token ? { fcmTokens: arrayRemove(token) } : {}),
  }).catch(() => {})

  await deleteToken(getMessaging(app)).catch(() => {})
  track('notif_permission', { rezultat: 'iskljuceno' })
}

// Uključi/isključi pojedini tip poruke (vrijedi za sve uređaje igrača).
export async function postaviTip(uid, tip, ukljucen) {
  if (!uid || !(tip in TIPOVI)) return
  await updateDoc(doc(db, 'users', uid), { [`notifPrefs.${tip}`]: !!ukljucen })
}

export function postavkeIzProfila(profile) {
  return { ...PODRAZUMIJEVANE_POSTAVKE, ...(profile?.notifPrefs || {}) }
}
