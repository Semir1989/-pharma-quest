import { getAnalytics, logEvent, setUserId, isSupported } from 'firebase/analytics'
import { app } from '../firebase'

// Firebase Analytics (GA4) — mjerenje bete: akvizicija, engagement, drop-off.
// GA4 sam računa D1/D7 retenciju iz session_start/first_open kad je SDK aktivan.
// Inicijalizuje se SAMO u produkciji (ne u dev/emulator modu) i ako je podržano.

let analytics = null
let pendingUid = null

if (import.meta.env.PROD) {
  isSupported()
    .then((ok) => {
      if (!ok) return
      analytics = getAnalytics(app)
      if (pendingUid) setUserId(analytics, pendingUid)
    })
    .catch(() => {})
}

// Zabilježi event (no-op ako analytics nije spreman/podržan).
export function track(name, params) {
  if (!analytics) return
  try {
    logEvent(analytics, name, params)
  } catch {
    /* ignore */
  }
}

// Poveži evente s korisnikom (uid, nije PII) — bolja per-user retencija.
export function setAnalyticsUser(uid) {
  pendingUid = uid || null
  if (analytics && uid) {
    try {
      setUserId(analytics, uid)
    } catch {
      /* ignore */
    }
  }
}
