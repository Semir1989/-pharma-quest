import { useEffect, useState } from 'react'
import {
  TIPOVI,
  stanje as stanjeNotifikacija,
  ukljuci,
  iskljuci,
  postaviTip,
  postavkeIzProfila,
} from '../services/notifikacije'

// Postavke push notifikacija na Profilu (F2.2).
//
// Ekran namjerno IMENUJE razlog kad notifikacije nisu dostupne umjesto da samo
// sakrije prekidač. Najvažniji slučaj je iPhone: web push tamo radi tek kad je
// aplikacija na početnom ekranu, pa igraču treba reći koji mu korak fali —
// inače izgleda kao da je funkcija pokvarena.
export default function NotifikacijePostavke({ uid, profile }) {
  const [stanje, setStanje] = useState(null)
  const [radi, setRadi] = useState(false)
  const [greska, setGreska] = useState('')
  const postavke = postavkeIzProfila(profile)

  useEffect(() => {
    stanjeNotifikacija().then(setStanje)
  }, [])

  // Dok se ne zna stanje, ne treperi praznom karticom.
  if (stanje === null) return null

  // Bez VAPID ključa funkcija nije ni postavljena — igraču nema šta da se nudi.
  if (stanje === 'nema-kljuca') return null

  async function prebaci() {
    setGreska('')
    setRadi(true)
    try {
      if (stanje === 'ukljuceno') {
        await iskljuci(uid)
      } else {
        const ok = await ukljuci(uid)
        if (!ok) setGreska('Dozvola nije data. Provjeri postavke browsera.')
      }
      setStanje(await stanjeNotifikacija())
    } catch {
      setGreska('Nešto nije prošlo. Pokušaj ponovo.')
    } finally {
      setRadi(false)
    }
  }

  const ukljuceno = stanje === 'ukljuceno'

  return (
    <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Notifikacije</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Najviše jedna poruka dnevno. Nikad noću.
          </p>
        </div>
        {(stanje === 'iskljuceno' || ukljuceno) && (
          <button
            onClick={prebaci}
            disabled={radi}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60 ${
              ukljuceno
                ? 'border border-slate-300 text-slate-600'
                : 'bg-teal-700 text-white active:bg-teal-800'
            }`}
          >
            {radi ? '…' : ukljuceno ? 'Isključi' : 'Uključi'}
          </button>
        )}
      </div>

      {stanje === 'ios-nije-instalirana' && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Fali jedan korak</p>
          <p className="mt-1 text-amber-800">
            Na iPhoneu notifikacije rade tek kad je igra dodana na početni ekran.
            U Safariju dodirni <b>Podijeli</b> (kvadrat sa strelicom) →{' '}
            <b>Dodaj na početni ekran</b>, pa je otvori odatle.
          </p>
        </div>
      )}

      {stanje === 'blokirano' && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          Notifikacije su blokirane u postavkama browsera za ovu stranicu.
          Uključi ih tamo pa se vrati.
        </p>
      )}

      {stanje === 'nepodrzano' && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          Ovaj browser ne podržava notifikacije.
        </p>
      )}

      {greska && <p className="mt-3 text-sm font-medium text-red-600">{greska}</p>}

      {ukljuceno && (
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
          {Object.entries(TIPOVI).map(([tip, { label, opis }]) => (
            <label key={tip} className="flex items-center justify-between gap-3">
              <span>
                <span className="text-sm font-semibold text-slate-700">{label}</span>
                <span className="block text-xs text-slate-400">{opis}</span>
              </span>
              <input
                type="checkbox"
                checked={postavke[tip] !== false}
                onChange={(e) => postaviTip(uid, tip, e.target.checked)}
                className="h-5 w-5 shrink-0 accent-teal-700"
              />
            </label>
          ))}
        </div>
      )}
    </section>
  )
}
