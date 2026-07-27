/* Service worker za push notifikacije (F2.2).
 *
 * NAMJERNO ne koristi Firebase SDK. Dva razloga:
 *   1. Firebase-ov firebase-messaging-sw.js traži importScripts s gstatic CDN-a
 *      i hardkodovan firebaseConfig u samom fajlu — ovdje ništa od toga ne
 *      treba, jer FCM za web na kraju šalje običan Push API event.
 *   2. getToken() prima gotovu registraciju (serviceWorkerRegistration), pa
 *      SW ne mora sadržavati nikakav Firebase kod — samo pushManager.
 *
 * PAŽNJA — SCOPE: aplikacija već ima service worker od vite-plugin-pwa na
 * scope-u '/'. Dva SW-a ne mogu držati isti scope, pa se ovaj registruje na
 * '/push-scope' (vidi src/services/notifikacije.js). Ne mijenjati bez razloga.
 *
 * Server šalje DATA-ONLY poruke (functions/index.js, posaljiNotifikaciju), pa
 * je format ispod pod našom kontrolom i nema dvosmislenosti oko toga hoće li
 * browser sam prikazati notifikaciju ili nećemo mi.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload = {}
  try {
    const sirovo = event.data.json()
    payload = sirovo.data || sirovo // FCM data-only stiže pod ključem `data`
  } catch {
    payload = { title: 'Pharma Quest', body: event.data.text() }
  }

  const title = payload.title || 'Pharma Quest'
  const url = payload.url || '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      // Nova poruka istog taga zamijeni staru umjesto da se gomila. Automatske
      // poruke dijele tag po tipu; admin objave dobiju svoj (server ga šalje).
      tag: payload.tag || payload.tip || 'pharma-quest',
      renotify: true,
      data: { url, tip: payload.tip || '' },
    })
  )
})

// Klik → fokusiraj već otvorenu aplikaciju ako postoji, inače otvori novu.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((klijenti) => {
      for (const k of klijenti) {
        if ('focus' in k) {
          if ('navigate' in k) k.navigate(url).catch(() => {})
          return k.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
