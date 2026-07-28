import { useEffect, useState } from 'react'
import {
  TIPOVI,
  stanje as stanjeNotifikacija,
  ukljuci,
  iskljuci,
  postaviTip,
  postavkeIzProfila,
  sinhronizuj,
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

  // Ovisnost je izvedena iz sadržaja, ne iz objekta profila — profile stiže iz
  // Firestore snapshota i mijenja identitet pri svakoj promjeni XP-a, pa bi se
  // inače getToken() vrtio bez potrebe.
  const potpisPretplate = `${profile?.notifOn}|${(profile?.fcmTokens || []).join(',')}`

  // Prvo tiha popravka (token je mogao ispasti iz baze), pa tek onda čitanje
  // stanja — inače bi ekran načas pokazao "isključeno" na ispravnom uređaju.
  useEffect(() => {
    let ziv = true
    ;(async () => {
      await sinhronizuj(uid, profile).catch(() => {})
      const s = await stanjeNotifikacija(profile).catch(() => 'iskljuceno')
      if (ziv) setStanje(s)
    })()
    return () => {
      ziv = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, potpisPretplate])

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
        setStanje('iskljuceno')
      } else {
        const ok = await ukljuci(uid)
        // Stanje se ne čita ponovo iz stanjeNotifikacija(profile): profile je
        // props i još drži staru listu tokena, pa bi svjež token ispao kao
        // "nije povezan". Rezultat ukljuci() je mjerodavan.
        setStanje(ok ? 'ukljuceno' : 'iskljuceno')
        if (!ok) setGreska('Dozvola nije data. Provjeri postavke browsera.')
      }
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
            Ujutro u 9 i uveče u 20. Ako si taj dan igrao — ništa ne stiže.
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
