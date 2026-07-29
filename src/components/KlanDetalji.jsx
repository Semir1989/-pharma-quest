import { useEffect, useState } from 'react'
import Avatar from './Avatar'
import { getClanDetails } from '../services/klanApi'

const OZNAKA_ULOGE = {
  founder: { label: 'Osnivač', klasa: 'bg-amber-100 text-amber-800' },
  advisor: { label: 'Savjetnik', klasa: 'bg-teal-100 text-teal-800' },
  member: { label: 'Član', klasa: 'bg-slate-100 text-slate-500' },
}

// Javni prikaz jednog klana — sastav i osnovni podaci, otvoren SVIM igračima.
//
// Ovo je ono što fali pri odluci kojem se klanu pridružiti: ime i broj članova
// ne govore ništa, a sastav govori sve. Zato je dostupan i onima koji su već u
// klanu (gledaju konkurenciju) i onima bez klana (biraju gdje idu).
export default function KlanDetalji({ clanId, mojUid, imamKlan, akcija, radi, naNazad }) {
  const [stanje, setStanje] = useState(null)
  const [greska, setGreska] = useState('')

  useEffect(() => {
    let otkazano = false
    getClanDetails({ clanId })
      .then((r) => !otkazano && setStanje(r))
      .catch((e) => !otkazano && setGreska(e?.message || 'Klan nije učitan.'))
    return () => {
      otkazano = true
    }
  }, [clanId])

  return (
    <div className="pb-6">
      <div className="px-4 pt-4">
        <button onClick={naNazad} className="text-sm font-bold text-teal-700">
          ← Nazad na klanove
        </button>
      </div>

      {greska && (
        <p className="mx-4 mt-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
          {greska}
        </p>
      )}

      {!stanje && !greska && <p className="mx-4 mt-4 text-sm text-slate-400">Učitavam…</p>}

      {stanje && (
        <>
          <section className="mx-4 mt-3 rounded-2xl bg-white p-4 shadow-sm">
            <h1 className="truncate font-title text-2xl font-extrabold text-slate-900">
              {stanje.clan.tag && (
                <span className="mr-1.5 rounded-lg bg-teal-700 px-2 py-0.5 align-middle text-sm font-bold text-white">
                  {stanje.clan.tag}
                </span>
              )}
              {stanje.clan.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {stanje.clan.memberCount}/{stanje.clan.maxClanova} članova · nivo klana{' '}
              {stanje.clan.clanLevel}
            </p>

            {/* Dugme za pridruživanje ima smisla samo igraču bez klana. */}
            {!imamKlan && !stanje.jaSam.clan && (
              <button
                onClick={() => akcija('join', clanId)}
                disabled={
                  !!radi ||
                  stanje.jaSam.zahtjevPoslan ||
                  stanje.clan.memberCount >= stanje.clan.maxClanova
                }
                className="mt-3 w-full rounded-xl bg-teal-700 py-2.5 text-sm font-bold text-white active:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {stanje.jaSam.zahtjevPoslan
                  ? 'Zahtjev poslan'
                  : stanje.clan.memberCount >= stanje.clan.maxClanova
                    ? 'Popunjen'
                    : 'Pošalji zahtjev za učlanjenje'}
              </button>
            )}
            {stanje.jaSam.clan && (
              <p className="mt-3 rounded-xl bg-teal-50 p-2.5 text-center text-sm font-bold text-teal-800">
                Ovo je tvoj klan
              </p>
            )}
            {imamKlan && !stanje.jaSam.clan && (
              <p className="mt-3 rounded-xl bg-slate-50 p-2.5 text-center text-sm text-slate-500">
                Već si u klanu — da bi prešao/la, prvo izađi iz svog.
              </p>
            )}
          </section>

          <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-bold text-slate-800">Članovi</h2>
            <div className="flex flex-col gap-3">
              {stanje.clanovi.map((c) => {
                const oz = OZNAKA_ULOGE[c.uloga] || OZNAKA_ULOGE.member
                return (
                  <div key={c.uid} className="flex items-center gap-3">
                    <Avatar id={c.avatar} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {c.ime}
                        {c.uid === mojUid && (
                          <span className="ml-1 text-xs text-slate-400">(ti)</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        Lvl {c.level} · {c.xp} XP
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${oz.klasa}`}
                    >
                      {oz.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
