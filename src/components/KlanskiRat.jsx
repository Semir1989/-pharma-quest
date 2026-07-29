import { useCallback, useEffect, useState } from 'react'
import Avatar from './Avatar'
import { getClanWar, startBuild, contributeToBuild, cancelBuild } from '../services/klanRatApi'
import { track } from '../services/analytics'

// Ekran klanskog rata i Zelenog Okruga.
//
// Sve stanje dolazi iz JEDNOG poziva (getClanWar) — živi skorovi su u RTDB-u, a
// klijent ih ne čita direktno nego kroz taj poziv. Nema listenera: rat se gleda
// povremeno, a živa pretplata bi značila čitanje kod svakog člana pri svakoj
// promjeni skora, tj. na svaki tačan odgovor bilo koga u klanu.

const bih = (ms) =>
  ms
    ? new Intl.DateTimeFormat('bs-BA', {
        timeZone: 'Europe/Sarajevo',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(ms))
    : '—'

const DANI = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub']

export default function KlanskiRat({ mojUid, mozeUpravljati }) {
  const [st, setSt] = useState(null)
  const [greska, setGreska] = useState('')
  const [radi, setRadi] = useState('')
  const [iznos, setIznos] = useState('')
  const [tab, setTab] = useState('rat') // rat | okrug

  const ucitaj = useCallback(async () => {
    try {
      setSt(await getClanWar())
    } catch (e) {
      setGreska(e?.message || 'Rat nije učitan.')
    }
  }, [])

  useEffect(() => {
    ucitaj()
  }, [ucitaj])

  async function akcija(ime, fn) {
    if (radi) return
    setRadi(ime)
    setGreska('')
    try {
      await fn()
      await ucitaj()
    } catch (e) {
      setGreska(e?.message || 'Nije prošlo.')
    } finally {
      setRadi('')
    }
  }

  if (greska && !st) {
    return <p className="mx-4 mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{greska}</p>
  }
  if (!st) return <p className="mx-4 mt-4 text-sm text-slate-400">Učitavam…</p>

  const rat = st.rat
  const okrug = st.okrug || {}
  const bon = okrug.bonusi || {}
  const gradnja = okrug.gradnja || null

  return (
    <div className="pb-4">
      <div className="mx-4 mt-4 flex gap-2 rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => setTab('rat')}
          className={`flex-1 rounded-lg py-2 text-sm font-bold ${tab === 'rat' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
        >
          ⚔️ Rat
        </button>
        <button
          onClick={() => setTab('okrug')}
          className={`flex-1 rounded-lg py-2 text-sm font-bold ${tab === 'okrug' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
        >
          🏗️ Zeleni Okrug
        </button>
      </div>

      {greska && (
        <p className="mx-4 mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{greska}</p>
      )}

      {tab === 'rat' ? (
        <>
          {!rat || rat.status !== 'active' ? (
            <section className="mx-4 mt-4 rounded-2xl bg-white p-4 text-center shadow-sm">
              <span className="text-4xl">⚔️</span>
              <p className="mt-2 font-title font-extrabold text-slate-800">
                Trenutno nema klanskog rata
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Rat traje od ponedjeljka 08:00 do petka 20:00. Svaki XP koji osvojiš nosi 1 bod
                svom klanu.
              </p>
            </section>
          ) : (
            <>
              {/* Rezultat meča */}
              <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="font-title text-lg font-extrabold text-slate-900">Rezultat</h2>
                  <span className="text-xs text-slate-400">do {bih(rat.endAt)}</span>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {Object.entries(st.skorovi || {})
                    .sort((a, b) => (b[1].cp || 0) - (a[1].cp || 0))
                    .map(([id, s]) => {
                      const moj = id === st.clan?.id
                      const max = Math.max(
                        1,
                        ...Object.values(st.skorovi || {}).map((x) => x.cp || 0)
                      )
                      return (
                        <div key={id}>
                          <div className="flex items-baseline justify-between">
                            <span
                              className={`truncate text-sm font-bold ${moj ? 'text-teal-800' : 'text-slate-600'}`}
                            >
                              {s.tag && <span className="mr-1 text-xs">[{s.tag}]</span>}
                              {s.name}
                              {moj && <span className="ml-1 text-xs text-slate-400">(mi)</span>}
                            </span>
                            <b className={moj ? 'text-teal-800' : 'text-slate-500'}>{s.cp} CP</b>
                          </div>
                          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-2.5 rounded-full ${moj ? 'bg-teal-600' : 'bg-slate-400'}`}
                              style={{ width: `${((s.cp || 0) / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                </div>

                {rat.mnozilacSada > 1 && (
                  <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-center text-sm font-bold text-amber-800">
                    🔥 Sada vrijedi {rat.mnozilacSada}× — iskoristi!
                  </p>
                )}
                {rat.boostKategorija && (
                  <p className="mt-2 text-xs text-slate-500">
                    Srijeda nosi 1.5× na kategoriju <b>{rat.boostKategorija}</b>. Petak 08–20 nosi
                    2× na sve.
                  </p>
                )}
              </section>

              {/* Dnevni bonus za učešće */}
              <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
                <h2 className="font-title text-base font-extrabold text-slate-900">
                  Dnevni bonus za učešće
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ako {st.prag} od {st.clan?.memberCount} članova odigra bar nešto tog dana, klan
                  dobija +100 CP.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(st.dani || {})
                    .sort()
                    .map(([dan, d]) => {
                      const aktivnih = d.aktivni ? Object.keys(d.aktivni).length : 0
                      const stanje = d.bonus
                      return (
                        <span
                          key={dan}
                          className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                            stanje === 'ispunjeno'
                              ? 'bg-emerald-100 text-emerald-800'
                              : stanje === 'stit'
                                ? 'bg-indigo-100 text-indigo-800'
                                : stanje === 'nedovoljno'
                                  ? 'bg-red-50 text-red-600'
                                  : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {DANI[new Date(`${dan}T12:00:00Z`).getUTCDay()]} {aktivnih}/{st.prag}
                          {stanje === 'ispunjeno' ? ' ✓' : ''}
                          {stanje === 'stit' ? ' 🛡' : ''}
                        </span>
                      )
                    })}
                  {Object.keys(st.dani || {}).length === 0 && (
                    <span className="text-xs text-slate-400">Još nema podataka za ovu sedmicu.</span>
                  )}
                </div>
              </section>

              {/* Doprinos članova */}
              <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
                <h2 className="font-title text-base font-extrabold text-slate-900">Ko je koliko</h2>
                <div className="mt-2 flex flex-col gap-2">
                  {Object.entries(st.doprinosi || {})
                    .sort((a, b) => (b[1].cp || 0) - (a[1].cp || 0))
                    .map(([uid, c]) => (
                      <div key={uid} className="flex items-center gap-3">
                        <Avatar id={c.avatar} size={32} />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">
                          {c.name}
                          {uid === mojUid && <span className="ml-1 text-xs text-slate-400">(ti)</span>}
                        </span>
                        <b className="shrink-0 text-sm text-teal-700">{c.cp} CP</b>
                      </div>
                    ))}
                  {Object.keys(st.doprinosi || {}).length === 0 && (
                    <p className="text-xs text-slate-400">Još niko nije osvojio bodove ove sedmice.</p>
                  )}
                </div>
              </section>
            </>
          )}
        </>
      ) : (
        <>
          {/* --- Zeleni Okrug --- */}
          <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-title text-lg font-extrabold text-slate-900">🟢 Zeleni Okrug</h2>
              <span className="text-sm font-bold text-emerald-700">
                Trezor: {okrug.trezor || 0}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Tvoji zeleni bodovi: <b className="text-emerald-700">{st.mojiBodovi || 0}</b> · rating
              klana: <b>{okrug.rating || 0}</b>
            </p>

            {/* Aktivni bonusi — da se vidi da gradnja nešto radi */}
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              {bon.xpBonus > 0 && <Znacka>+{Math.round(bon.xpBonus * 100)}% XP</Znacka>}
              {bon.sekunde > 0 && <Znacka>+{bon.sekunde}s tajmer</Znacka>}
              {bon.cpBonus > 0 && <Znacka>+{Math.round(bon.cpBonus * 100)}% CP</Znacka>}
              {bon.stitovi > 0 && <Znacka>{bon.stitovi}× štit smjene</Znacka>}
              {bon.goldBonus > 0 && <Znacka>+{Math.round(bon.goldBonus * 100)}% bodova</Znacka>}
              {bon.comboBonus > 0 && <Znacka>combo +{Math.round(bon.comboBonus * 100)}%</Znacka>}
              {bon.hintovi > 0 && <Znacka>{bon.hintovi}× 50:50 sedmično</Znacka>}
              {!bon.xpBonus && !bon.sekunde && !bon.cpBonus && !bon.hintovi && (
                <span className="text-slate-400">Još nijedan bonus nije aktivan.</span>
              )}
            </div>
          </section>

          {/* Aktivna gradnja */}
          {gradnja ? (
            <section className="mx-4 mt-4 rounded-2xl bg-emerald-50 p-4 shadow-sm ring-1 ring-emerald-200">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                Gradimo sada
              </p>
              <h3 className="mt-0.5 font-title text-lg font-extrabold text-emerald-950">
                {ikona(st.objekti, gradnja.objekatId)} {naziv(st.objekti, gradnja.objekatId)} — nivo{' '}
                {gradnja.nivo}
              </h3>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-white">
                <div
                  className="h-3 rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${Math.min(100, ((gradnja.sakupljeno || 0) / gradnja.cijena) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-sm font-bold text-emerald-900">
                {gradnja.sakupljeno || 0} / {gradnja.cijena} zelenih bodova
              </p>

              <div className="mt-3 flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={iznos}
                  onChange={(e) => setIznos(e.target.value)}
                  placeholder="koliko ulažeš"
                  className="min-w-0 flex-1 rounded-lg border border-emerald-300 px-3 py-2 text-sm"
                />
                <button
                  onClick={() =>
                    akcija('ulog', async () => {
                      const r = await contributeToBuild({ iznos: Number(iznos) })
                      track('okrug_ulog', { iznos: r.ulozeno, gotovo: r.gotovo })
                      setIznos('')
                    })
                  }
                  disabled={!!radi || !Number(iznos)}
                  className="shrink-0 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {radi === 'ulog' ? '…' : 'Uloži'}
                </button>
              </div>
              <button
                onClick={() => setIznos(String(st.mojiBodovi || 0))}
                className="mt-1 text-xs font-bold text-emerald-700"
              >
                Sve što imam ({st.mojiBodovi || 0})
              </button>

              {mozeUpravljati && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() =>
                      akcija('trezor', () =>
                        contributeToBuild({ iznos: okrug.trezor || 0, izTrezora: true })
                      )
                    }
                    disabled={!!radi || !(okrug.trezor > 0)}
                    className="flex-1 rounded-lg bg-emerald-200 py-2 text-xs font-bold text-emerald-900 disabled:opacity-50"
                  >
                    Uloži iz trezora ({okrug.trezor || 0})
                  </button>
                  <button
                    onClick={() => akcija('otkazi', () => cancelBuild({}))}
                    disabled={!!radi}
                    className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600"
                  >
                    Otkaži
                  </button>
                </div>
              )}
              {mozeUpravljati && (
                <p className="mt-1 text-[11px] text-emerald-800">
                  Otkazivanje vraća sve uloge onima koji su ih dali.
                </p>
              )}
            </section>
          ) : (
            <p className="mx-4 mt-4 rounded-xl bg-slate-50 p-3 text-center text-sm text-slate-500">
              {mozeUpravljati
                ? 'Izaberi šta klan gradi sljedeće.'
                : 'Osnivač ili savjetnik još nije izabrao cilj gradnje.'}
            </p>
          )}

          {/* Lista objekata */}
          <section className="mx-4 mt-4 flex flex-col gap-2">
            {(st.objekti || []).map((o) => {
              const nivo = okrug.nivoi?.[o.id] || 0
              const sljedeca = st.cijene?.[o.id]?.[nivo] || null
              const maks = nivo >= 5
              return (
                <div key={o.id} className="rounded-2xl bg-white p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{o.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800">{o.naziv}</p>
                      <p className="text-xs text-slate-500">{o.efekat}</p>
                      {o.status === 'spremno' && (
                        <p className="mt-0.5 text-[11px] font-bold text-amber-700">
                          Efekat čeka uključenje gubitka ratinga.
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-title text-lg font-extrabold text-emerald-700">
                        {nivo}
                        <span className="text-xs text-slate-400">/5</span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex flex-1 gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <div
                          key={n}
                          className={`h-1.5 flex-1 rounded-full ${n <= nivo ? 'bg-emerald-500' : 'bg-slate-200'}`}
                        />
                      ))}
                    </div>
                    {!maks && (
                      <span className="shrink-0 text-xs font-bold text-slate-500">
                        {sljedeca} 🟢
                      </span>
                    )}
                  </div>
                  {mozeUpravljati && !gradnja && !maks && (
                    <button
                      onClick={() =>
                        akcija('cilj', () => startBuild({ objekatId: o.id }))
                      }
                      disabled={!!radi}
                      className="mt-2 w-full rounded-lg bg-emerald-700 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      Gradi nivo {nivo + 1} ({sljedeca} bodova)
                    </button>
                  )}
                </div>
              )
            })}
          </section>
        </>
      )}

      <button
        onClick={ucitaj}
        className="mx-4 mt-4 w-[calc(100%-2rem)] rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-600"
      >
        ↻ Osvježi
      </button>
    </div>
  )
}

const Znacka = ({ children }) => (
  <span className="rounded-lg bg-emerald-100 px-2 py-1 font-bold text-emerald-800">{children}</span>
)

const naziv = (objekti, id) => objekti?.find((o) => o.id === id)?.naziv || id
const ikona = (objekti, id) => objekti?.find((o) => o.id === id)?.emoji || '🏗️'
