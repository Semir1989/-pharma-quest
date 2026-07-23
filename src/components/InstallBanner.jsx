import { useEffect, useState } from 'react'

// "Instaliraj aplikaciju" banner (Modul 8 — PWA).
// Android/Chrome: hvata beforeinstallprompt i nudi pravo dugme.
// iOS (Safari nema taj event): prikazuje kratko uputstvo Podijeli → Dodaj na početni ekran.
// Korisnik može odbaciti banner — pamti se u localStorage.

const DISMISS_KEY = 'pq-install-dismissed'

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // iOS Safari
  )
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

export default function InstallBanner() {
  const [installEvent, setInstallEvent] = useState(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault() // ne prikazuj browserov mini-bar, imamo svoje dugme
      setInstallEvent(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (dismissed || isStandalone()) return null

  const showIosHint = isIos()
  if (!installEvent && !showIosHint) return null

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  async function install() {
    installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    if (outcome === 'accepted') setDismissed(true)
    setInstallEvent(null)
  }

  return (
    <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">📲</span>
        <div className="flex-1">
          <h2 className="font-bold text-teal-900">Instaliraj Pharma Quest</h2>
          {showIosHint && !installEvent ? (
            <p className="mt-1 text-sm text-teal-800">
              Otvori <span className="font-bold">Podijeli</span> (ikona ⬆️ u Safariju) pa
              odaberi <span className="font-bold">„Dodaj na početni ekran"</span> — igra
              postaje aplikacija na tvom telefonu.
            </p>
          ) : (
            <p className="mt-1 text-sm text-teal-800">
              Dodaj igru na početni ekran — radi kao prava aplikacija, i offline.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {installEvent && (
              <button
                onClick={install}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white active:bg-teal-800"
              >
                Instaliraj
              </button>
            )}
            <button onClick={dismiss} className="px-3 py-2 text-sm font-medium text-teal-700">
              Ne sada
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
