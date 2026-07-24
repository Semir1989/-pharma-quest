import { useRegisterSW } from 'virtual:pwa-register/react'

// Toast "Dostupna nova verzija — osvježi" (Etapa 8).
// vite.config.js koristi registerType 'prompt': kad service worker detektuje
// novu verziju, needRefresh postane true. Klik na "Osvježi" aktivira novi SW i
// reloaduje aplikaciju (updateServiceWorker(true)). Dok igrač ne klikne, radi
// dalje na staroj verziji — ništa se ne prekida usred kviza.
const UPDATE_CHECK_MS = 60 * 60 * 1000 // periodična provjera nove verzije (1h)

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Provjeravaj nove verzije i dok je aplikacija otvorena (duge sesije).
      if (registration) {
        setInterval(() => registration.update(), UPDATE_CHECK_MS)
      }
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl">
        <span className="text-xl">🚀</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Dostupna nova verzija</p>
          <p className="text-xs text-slate-300">Osvježi da preuzmeš najnovije.</p>
        </div>
        <button
          onClick={() => updateServiceWorker(true)}
          className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-sm font-extrabold text-white active:bg-amber-600"
        >
          Osvježi
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          aria-label="Zatvori"
          className="shrink-0 rounded-lg px-1.5 text-slate-400 active:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
