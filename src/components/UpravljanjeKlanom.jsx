import { useState } from 'react'
import Avatar from './Avatar'
import { getClanPlayerDetails } from '../services/klanApi'

// Ekran "Upravljanje klanom" — vide ga osnivač i savjetnici.
//
// Razlike u dozvolama nisu skrivene nego ISPISANE: savjetnik vidi zašto ne može
// izbaciti drugog savjetnika ili raspustiti klan. Sakrivena dugmad ostavljaju
// dojam kvara, a savjetnik ionako sazna kad pokuša — server odbije.
export default function UpravljanjeKlanom({
  clan,
  uloga,
  clanovi,
  zahtjevi,
  mojUid,
  akcija,
  radi,
}) {
  const [detalji, setDetalji] = useState({}) // uid → profil
  const [ucitava, setUcitava] = useState('')
  const [potvrdaRaspustanja, setPotvrdaRaspustanja] = useState(false)
  const jeOsnivac = uloga === 'founder'

  async function otvoriDetalje(uid) {
    if (detalji[uid]) {
      setDetalji((d) => ({ ...d, [uid]: null }))
      return
    }
    setUcitava(uid)
    try {
      const r = await getClanPlayerDetails({ uid })
      setDetalji((d) => ({ ...d, [uid]: r }))
    } catch {
      setDetalji((d) => ({ ...d, [uid]: { greska: true } }))
    } finally {
      setUcitava('')
    }
  }

  function Detalji({ podaci }) {
    if (!podaci) return null
    if (podaci.greska)
      return <p className="mt-2 text-xs text-red-600">Detalji nisu učitani.</p>
    return (
      <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        <p>
          <b>{podaci.xp} XP</b> · level {podaci.level} · niz {podaci.streak} dana
        </p>
        <p className="mt-1">
          Preživljavanje:{' '}
          {podaci.survival
            ? `najbolji niz ${podaci.survival.streak} (sedmica ${podaci.survival.week})`
            : 'nema odigranog pokušaja'}
        </p>
        <p className="mt-1 text-slate-400">
          Zadnji kviz: {podaci.lastPlayDay || 'nikad'}
        </p>
      </div>
    )
  }

  return (
    <>
      {/* --- Zahtjevi za ulazak --- */}
      <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">
          Zahtjevi za ulazak {zahtjevi.length > 0 && `(${zahtjevi.length})`}
        </h2>

        {zahtjevi.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">Trenutno nema zahtjeva.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {zahtjevi.map((z) => (
              <div key={z.uid} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <Avatar id={z.avatar} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{z.ime}</p>
                    <p className="text-xs text-slate-400">
                      Lvl {z.level} · {z.xp} XP ·{' '}
                      {z.survival
                        ? `Preživljavanje: ${z.survival.streak} (${z.survival.week})`
                        : 'bez Preživljavanja'}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => akcija('approve', z.uid)}
                    disabled={!!radi || clan.memberCount >= clan.maxClanova}
                    className="flex-1 rounded-xl bg-teal-700 py-2 text-sm font-bold text-white active:bg-teal-800 disabled:opacity-50"
                  >
                    {clan.memberCount >= clan.maxClanova ? 'Klan je pun' : 'Primi'}
                  </button>
                  <button
                    onClick={() => akcija('reject', z.uid)}
                    disabled={!!radi}
                    className="flex-1 rounded-xl border border-slate-300 py-2 text-sm font-bold text-slate-600 disabled:opacity-50"
                  >
                    Odbij
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --- Članovi --- */}
      <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">
          Članovi ({clan.memberCount}/{clan.maxClanova})
        </h2>

        <div className="mt-3 flex flex-col gap-4">
          {clanovi.map((c) => {
            const jaSam = c.uid === mojUid
            const smijemIzbaciti =
              !jaSam && c.uloga !== 'founder' && !(uloga === 'advisor' && c.uloga === 'advisor')

            return (
              <div key={c.uid} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                <button
                  onClick={() => otvoriDetalje(c.uid)}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <Avatar id={c.avatar} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">
                      {c.ime}
                      {jaSam && <span className="ml-1 text-xs text-slate-400">(ti)</span>}
                    </p>
                    <p className="text-xs text-slate-400">
                      Lvl {c.level} · {c.xp} XP ·{' '}
                      {c.uloga === 'founder'
                        ? 'osnivač'
                        : c.uloga === 'advisor'
                          ? 'savjetnik'
                          : 'član'}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {ucitava === c.uid ? '…' : detalji[c.uid] ? 'Sakrij' : 'Detalji'}
                  </span>
                </button>

                <Detalji podaci={detalji[c.uid]} />

                <div className="mt-2 flex flex-wrap gap-2">
                  {jeOsnivac && c.uloga === 'member' && (
                    <button
                      onClick={() => akcija('assignAdvisor', c.uid)}
                      disabled={!!radi || (clan.advisorIds || []).length >= 2}
                      className="rounded-xl border border-teal-300 px-3 py-1.5 text-xs font-bold text-teal-700 disabled:opacity-40"
                    >
                      {(clan.advisorIds || []).length >= 2 ? 'Već 2 savjetnika' : 'Imenuj savjetnikom'}
                    </button>
                  )}
                  {jeOsnivac && c.uloga === 'advisor' && (
                    <button
                      onClick={() => akcija('removeAdvisor', c.uid)}
                      disabled={!!radi}
                      className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40"
                    >
                      Smijeni savjetnika
                    </button>
                  )}
                  {smijemIzbaciti && (
                    <button
                      onClick={() => akcija('kick', c.uid)}
                      disabled={!!radi}
                      className="rounded-xl border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 disabled:opacity-40"
                    >
                      Izbaci
                    </button>
                  )}
                  {uloga === 'advisor' && c.uloga === 'advisor' && !jaSam && (
                    <span className="self-center text-[11px] text-slate-400">
                      Savjetnik ne može izbaciti drugog savjetnika.
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* --- Raspuštanje: samo osnivač, potvrda u dva koraka --- */}
      <section className="mx-4 mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
        <h2 className="font-title text-lg font-extrabold text-red-900">Raspuštanje klana</h2>
        {jeOsnivac ? (
          <>
            <p className="mt-0.5 text-xs text-red-700">
              Svi članovi ostaju bez klana. <b>Ne može se povući.</b>
            </p>
            {!potvrdaRaspustanja ? (
              <button
                onClick={() => setPotvrdaRaspustanja(true)}
                disabled={!!radi}
                className="mt-3 w-full rounded-xl bg-red-600 py-2.5 font-bold text-white active:bg-red-700 disabled:opacity-50"
              >
                Raspusti klan
              </button>
            ) : (
              <div className="mt-3 rounded-xl border border-red-300 bg-white p-3">
                <p className="text-sm font-bold text-red-800">
                  Da li ste sigurni? Klan {clan.name} prestaje postojati.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setPotvrdaRaspustanja(false)}
                    disabled={!!radi}
                    className="flex-1 rounded-xl border border-slate-300 py-2.5 font-bold text-slate-600 disabled:opacity-50"
                  >
                    Odustani
                  </button>
                  <button
                    onClick={() => akcija('disband')}
                    disabled={!!radi}
                    className="flex-1 rounded-xl bg-red-600 py-2.5 font-extrabold text-white active:bg-red-700 disabled:opacity-50"
                  >
                    {radi === 'disband' ? 'Raspuštam…' : 'Da, raspusti'}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="mt-0.5 text-xs text-red-700">
            Klan može raspustiti samo osnivač. Savjetnik nema tu ovlast.
          </p>
        )}
      </section>
    </>
  )
}
