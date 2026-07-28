import { useEffect, useMemo, useState } from 'react'
import { MIN_LEVEL_OSNIVANJE, IME_MIN, IME_MAX, TAG_MAX } from '../../functions/klan-pravila.js'
import { pretraziKlanove } from '../services/klanApi'

// Ekran "Pronađi klan" — za igrače bez klana.
//
// Popis se čita direktno iz Firestorea (clans/* je read-only za prijavljene),
// pa pretraga ne troši nijedan poziv Cloud Functiona.
export default function PronadjiKlan({ level, mojUid, akcija, radi }) {
  const [klanovi, setKlanovi] = useState(null)
  const [trazi, setTrazi] = useState('')
  const [otvoriOsnivanje, setOtvoriOsnivanje] = useState(false)
  const [ime, setIme] = useState('')
  const [tag, setTag] = useState('')

  useEffect(() => {
    pretraziKlanove()
      .then(setKlanovi)
      .catch(() => setKlanovi([]))
  }, [])

  const filtrirani = useMemo(() => {
    if (!klanovi) return null
    const t = trazi.trim().toLowerCase()
    if (!t) return klanovi
    return klanovi.filter(
      (k) => k.name.toLowerCase().includes(t) || (k.tag || '').toLowerCase().includes(t)
    )
  }, [klanovi, trazi])

  const mozeOsnovati = level >= MIN_LEVEL_OSNIVANJE

  return (
    <>
      {/* --- Osnivanje --- */}
      <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-teal-100">
        <h2 className="text-lg font-bold text-slate-800">Osnuj svoj klan</h2>
        {mozeOsnovati ? (
          <>
            <p className="mt-0.5 text-sm text-slate-500">
              Ti biraš ko ulazi, imenuješ do dva savjetnika i prijavljuješ klan na
              sedmično takmičenje.
            </p>
            {!otvoriOsnivanje ? (
              <button
                onClick={() => setOtvoriOsnivanje(true)}
                className="mt-3 w-full rounded-xl bg-teal-700 py-2.5 text-sm font-bold text-white active:bg-teal-800"
              >
                Osnuj klan
              </button>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-500">Ime klana</label>
                <input
                  value={ime}
                  onChange={(e) => setIme(e.target.value)}
                  maxLength={IME_MAX}
                  placeholder="npr. Farmaceuti BiH"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-teal-500"
                />
                <label className="text-xs font-bold text-slate-500">Tag (opciono)</label>
                <input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  maxLength={TAG_MAX}
                  placeholder="npr. RX"
                  className="rounded-lg border border-slate-200 px-3 py-2 uppercase text-slate-800 outline-none focus:border-teal-500"
                />
                <button
                  onClick={() => akcija('create', { name: ime, tag })}
                  disabled={ime.trim().length < IME_MIN || !!radi}
                  className="mt-1 w-full rounded-xl bg-teal-700 py-2.5 text-sm font-bold text-white active:bg-teal-800 disabled:opacity-50"
                >
                  {radi === 'create' ? 'Osnivam…' : 'Potvrdi osnivanje'}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="mt-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            Klan možeš osnovati od <b>levela {MIN_LEVEL_OSNIVANJE}</b> — trenutno si na
            levelu {level}. Do tada se možeš pridružiti postojećem klanu, bez obzira
            na level.
          </p>
        )}
      </section>

      {/* --- Popis klanova --- */}
      <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">Klanovi</h2>
        <input
          value={trazi}
          onChange={(e) => setTrazi(e.target.value)}
          placeholder="Pretraži po imenu ili tagu"
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-teal-500"
        />

        {filtrirani === null ? (
          <p className="mt-3 text-sm text-slate-400">Učitavam…</p>
        ) : filtrirani.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            {klanovi.length === 0
              ? 'Još nema nijednog klana. Budi prvi.'
              : 'Nijedan klan ne odgovara pretrazi.'}
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {filtrirani.map((k) => {
              const poslan = (k.pendingRequests || []).includes(mojUid)
              const pun = k.memberCount >= 10
              return (
                <div key={k.id} className="flex items-center gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">
                      {k.tag && (
                        <span className="mr-1.5 rounded bg-teal-700 px-1.5 py-0.5 text-[11px] font-bold text-white">
                          {k.tag}
                        </span>
                      )}
                      {k.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {k.memberCount}/10 članova · nivo {k.clanLevel}
                    </p>
                  </div>
                  <button
                    onClick={() => akcija('join', k.id)}
                    disabled={pun || poslan || !!radi}
                    className="shrink-0 rounded-xl bg-teal-700 px-3 py-2 text-xs font-bold text-white active:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    {poslan ? 'Zahtjev poslan' : pun ? 'Popunjen' : 'Pošalji zahtjev'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}
