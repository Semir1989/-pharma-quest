import { useState } from 'react'
import { TIPOVI, postaviTip, postavkeIzProfila } from '../services/notifikacije'

// Postavke push notifikacija na Profilu (F2.2).
//
// Stoji odmah ispod avatara, prije bedževa i statistike — ranije je bila na dnu
// ekrana i igrači je nisu nalazili, a prekidač koji niko ne vidi je isto što i
// ugašena funkcija.
//
// Ekran namjerno IMENUJE razlog kad notifikacije nisu dostupne umjesto da samo
// sakrije prekidač. Najvažniji slučaj je iPhone: web push tamo radi tek kad je
// aplikacija na početnom ekranu, pa igraču treba reći koji mu korak fali —
// inače izgleda kao da je funkcija pokvarena.
//
// Stanje dolazi izvana (useNotifikacije) jer isti prekidač stoji i kao zvono uz
// avatar — vidi src/hooks/useNotifikacije.js.
export default function NotifikacijePostavke({ uid, profile, notif }) {
  const [otvoreno, setOtvoreno] = useState(false)
  const { stanje, radi, greska, ukljuceno, prebaci } = notif
  const postavke = postavkeIzProfila(profile)

  // Dok se ne zna stanje, ne treperi praznom karticom.
  if (stanje === null) return null

  // Bez VAPID ključa funkcija nije ni postavljena — igraču nema šta da se nudi.
  if (stanje === 'nema-kljuca') return null

  // --- Isključeno: poziv na akciju, ne siva kartica ---------------------------
  if (!ukljuceno) {
    return (
      <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-teal-100">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔔</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-800">Uključi notifikacije</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Podsjetnik za dnevni kviz, niz koji ističe, turniri i objave. Ujutro
              u 9 i uveče u 20 — a ako si taj dan igrao, ništa ne stiže.
            </p>

            {stanje === 'iskljuceno' && (
              <button
                onClick={prebaci}
                disabled={radi}
                className="mt-3 w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white active:bg-teal-800 disabled:opacity-60"
              >
                {radi ? '…' : 'Uključi notifikacije'}
              </button>
            )}

            {stanje === 'ios-nije-instalirana' && (
              <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">Fali jedan korak</p>
                <p className="mt-1 text-amber-800">
                  Na iPhoneu notifikacije rade tek kad je igra dodana na početni
                  ekran. U Safariju dodirni <b>Podijeli</b> (kvadrat sa strelicom)
                  → <b>Dodaj na početni ekran</b>, pa je otvori odatle.
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
          </div>
        </div>
      </section>
    )
  }

  // --- Uključeno: kratak red, vrste poruka iza "Podesi" ----------------------
  // Sve vrste su podrazumijevano uključene (i na serveru: notif-odluka.js gleda
  // notifPrefs?.[tip] !== false), pa lista ovdje stoji sklopljena — ko je hoće
  // mijenjati, otvori je.
  const ugasenih = Object.keys(TIPOVI).filter((t) => postavke[t] === false).length

  return (
    <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            🔔 Notifikacije
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700">
              uključene
            </span>
          </h2>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {ugasenih === 0
              ? 'Primaš sve vrste poruka'
              : `${ugasenih} ${ugasenih === 1 ? 'vrsta je ugašena' : 'vrste su ugašene'}`}
          </p>
        </div>
        <button
          onClick={() => setOtvoreno((o) => !o)}
          className="shrink-0 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600"
        >
          {otvoreno ? 'Zatvori' : 'Podesi'}
        </button>
      </div>

      {greska && <p className="mt-3 text-sm font-medium text-red-600">{greska}</p>}

      {otvoreno && (
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

          <button
            onClick={prebaci}
            disabled={radi}
            className="mt-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 disabled:opacity-60"
          >
            {radi ? '…' : 'Isključi sve notifikacije'}
          </button>
        </div>
      )}
    </section>
  )
}
