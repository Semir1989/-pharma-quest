import { useCallback, useEffect, useState } from 'react'
import {
  adminWarStatus,
  adminWarCreate,
  adminWarStart,
  adminWarEnd,
  adminWarPause,
  adminWarCancel,
  adminWarSetConfig,
  adminWarRecomputeDay,
} from '../../services/klanRatApi'

// Kontrola klanskog rata iz admin panela.
//
// Rat traje pet dana, dira bodovanje i isplaćuje nagrade — sve poluge koje bi
// inače tražile skriptu s računara moraju biti ovdje. Redoslijed sekcija prati
// ono što se radi: vidi upozorenja → napravi parove → pokreni → prati → zatvori.
//
// Sve termine unosiš i vidiš po BiH vremenu; prema serveru idu kao ms epoch.

function msUlokalni(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const lokalniUms = (v) => (v ? new Date(v).getTime() : 0)

const bih = (ms) =>
  ms
    ? new Intl.DateTimeFormat('bs-BA', {
        timeZone: 'Europe/Sarajevo',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(ms))
    : '—'

const BOJA_UPOZORENJA = {
  blok: 'bg-red-50 text-red-800 ring-red-200',
  upozorenje: 'bg-amber-50 text-amber-900 ring-amber-200',
  info: 'bg-slate-50 text-slate-600 ring-slate-200',
}

export default function RatKontrola() {
  const [st, setSt] = useState(null)
  const [radi, setRadi] = useState('')
  const [poruka, setPoruka] = useState('')
  const [greska, setGreska] = useState('')
  const [otvoren, setOtvoren] = useState(false)
  const [kraj, setKraj] = useState('')
  const [rucniParovi, setRucniParovi] = useState([]) // [[clanId, clanId?], ...]
  const [kategorija, setKategorija] = useState('')
  const [danZaObracun, setDanZaObracun] = useState('')

  const ucitaj = useCallback(async () => {
    try {
      const s = await adminWarStatus()
      setSt(s)
      setKraj(msUlokalni(s.config?.endAt || 0))
      setKategorija(s.config?.boostKategorija || '')
    } catch (e) {
      setGreska(e?.message || 'Stanje rata nije učitano.')
    }
  }, [])

  useEffect(() => {
    if (otvoren) ucitaj()
  }, [otvoren, ucitaj])

  async function akcija(ime, fn) {
    if (radi) return
    setRadi(ime)
    setGreska('')
    setPoruka('')
    try {
      const r = await fn()
      setPoruka(typeof r === 'string' ? r : 'Urađeno.')
      await ucitaj()
    } catch (e) {
      setGreska(e?.message || 'Akcija nije prošla.')
    } finally {
      setRadi('')
    }
  }

  // Petak 20:00 ove sedmice — najčešći kraj, da se ne kuca ručno.
  function petak20() {
    const d = new Date()
    const doPetka = (5 - d.getDay() + 7) % 7
    d.setDate(d.getDate() + doPetka)
    d.setHours(20, 0, 0, 0)
    return d
  }

  if (!otvoren) {
    return (
      <button
        onClick={() => setOtvoren(true)}
        className="mt-4 w-full rounded-2xl bg-emerald-700 py-3 font-title font-extrabold text-white active:bg-emerald-800"
      >
        ⚔️ Klanski rat — kontrola
      </button>
    )
  }

  const cfg = st?.config || null
  const aktivan = cfg?.status === 'active' && cfg?.enabled !== false
  const klanovi = st?.klanovi || []
  const uparen = new Set((st?.mecevi || []).flatMap((m) => m.clanIds || []))
  const blokada = (st?.upozorenja || []).some((u) => u.nivo === 'blok')

  return (
    <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-emerald-200">
      <div className="flex items-center justify-between">
        <h2 className="font-title text-lg font-extrabold text-slate-900">⚔️ Klanski rat</h2>
        <button onClick={() => setOtvoren(false)} className="text-sm font-bold text-slate-400">
          Zatvori
        </button>
      </div>

      {!st ? (
        <p className="mt-3 text-sm text-slate-400">Učitavam…</p>
      ) : (
        <>
          {/* --- Stanje --- */}
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
            <p>
              <b>Status:</b>{' '}
              {aktivan ? (
                <span className="font-bold text-emerald-700">AKTIVAN</span>
              ) : cfg?.status === 'resolved' ? (
                'zatvoren'
              ) : cfg?.enabled === false ? (
                <span className="font-bold text-red-600">PAUZIRAN</span>
              ) : (
                'nije pokrenut'
              )}
            </p>
            <p className="mt-0.5 text-slate-600">
              Sedmica: <b>{cfg?.warId || st.predlozeniWarId}</b> · {bih(cfg?.startAt)} →{' '}
              {bih(cfg?.endAt)}
            </p>
            <p className="mt-0.5 text-slate-600">
              Srijeda boost: <b>{cfg?.boostKategorija || '—'}</b> · očekivano po satu:{' '}
              <b>{st.ocekivanoUToku ? 'rat traje' : 'van prozora'}</b>
            </p>
          </div>

          {/* --- Upozorenja: prvo što admin treba vidjeti --- */}
          {(st.upozorenja || []).length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {st.upozorenja.map((u, i) => (
                <p
                  key={i}
                  className={`rounded-xl px-3 py-2 text-xs font-medium ring-1 ${BOJA_UPOZORENJA[u.nivo] || BOJA_UPOZORENJA.info}`}
                >
                  {u.nivo === 'blok' ? '⛔ ' : u.nivo === 'upozorenje' ? '⚠️ ' : 'ℹ️ '}
                  {u.tekst}
                </p>
              ))}
            </div>
          )}

          {greska && (
            <p className="mt-3 rounded-xl bg-red-50 p-2.5 text-sm font-medium text-red-700">{greska}</p>
          )}
          {poruka && (
            <p className="mt-3 rounded-xl bg-teal-50 p-2.5 text-sm font-medium text-teal-800">{poruka}</p>
          )}

          {/* --- Klanovi i ručno uparivanje --- */}
          <h3 className="mt-4 text-sm font-bold text-slate-700">Klanovi ({klanovi.length})</h3>
          <div className="mt-1.5 flex flex-col gap-1">
            {klanovi.map((k) => (
              <div key={k.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-bold text-slate-700">
                  {k.tag && <span className="mr-1 text-teal-700">[{k.tag}]</span>}
                  {k.name}
                </span>
                <span className="shrink-0 text-slate-400">
                  {k.memberCount} čl. · {k.rating} rtg · {k.trezor} 🟢
                </span>
                {uparen.has(k.id) ? (
                  <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-700">
                    upar.
                  </span>
                ) : (
                  <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-slate-500">—</span>
                )}
              </div>
            ))}
            {klanovi.length === 0 && <p className="text-xs text-slate-400">Nema nijednog klana.</p>}
          </div>

          <RucnoUparivanje
            klanovi={klanovi}
            parovi={rucniParovi}
            setParovi={setRucniParovi}
          />

          {/* --- Poluge --- */}
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={() =>
                akcija('create', async () => {
                  const parovi = rucniParovi.length
                    ? rucniParovi.map((p) => ({ clanIds: p, grupni: p.length > 2 }))
                    : null
                  const r = await adminWarCreate({ parovi, prepisi: true })
                  return `Napravljeno ${r.parovi.length} meč(eva)${parovi ? ' (ručno uparen)' : ' (po ratingu)'}, boost: ${r.boostKategorija || '—'}`
                })
              }
              disabled={!!radi || klanovi.length < 2}
              className="rounded-xl bg-slate-700 py-2.5 text-sm font-bold text-white active:bg-slate-800 disabled:opacity-50"
            >
              {radi === 'create' ? 'Pravim…' : '1. Napravi parove'}
              {rucniParovi.length > 0 && ` (ručno: ${rucniParovi.length})`}
            </button>

            <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
              <label className="text-xs font-bold text-emerald-900">Kraj rata</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="datetime-local"
                  value={kraj}
                  onChange={(e) => setKraj(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-emerald-300 px-2 py-1.5 text-sm"
                />
                <button
                  onClick={() => setKraj(msUlokalni(petak20().getTime()))}
                  className="shrink-0 rounded-lg bg-emerald-200 px-2 text-xs font-bold text-emerald-900"
                >
                  petak 20:00
                </button>
              </div>
              <button
                onClick={() =>
                  akcija('start', async () => {
                    const r = await adminWarStart({ endAt: lokalniUms(kraj) || null })
                    return `Rat ${r.warId} je POKRENUT do ${bih(r.endAt)}.`
                  })
                }
                disabled={!!radi || blokada}
                className="mt-2 w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-extrabold text-white active:bg-emerald-800 disabled:opacity-50"
              >
                {radi === 'start' ? 'Pokrećem…' : '2. Pokreni rat ODMAH'}
              </button>
              {blokada && (
                <p className="mt-1 text-[11px] font-bold text-red-700">
                  Blokirano dok ima ⛔ upozorenja.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={kategorija}
                onChange={(e) => setKategorija(e.target.value)}
                placeholder="kategorija za srijedu"
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
              />
              <button
                onClick={() =>
                  akcija('cfg', async () => {
                    await adminWarSetConfig({
                      boostKategorija: kategorija.trim() || null,
                      endAt: lokalniUms(kraj) || null,
                    })
                    return 'Podešavanja sačuvana.'
                  })
                }
                disabled={!!radi}
                className="shrink-0 rounded-lg bg-slate-200 px-3 text-sm font-bold text-slate-700"
              >
                Sačuvaj
              </button>
            </div>

            <button
              onClick={() => akcija('pause', () => adminWarPause({ enabled: cfg?.enabled === false }))}
              disabled={!!radi || !cfg?.warId}
              className={`rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
                cfg?.enabled === false ? 'bg-teal-700' : 'bg-amber-600'
              }`}
            >
              {cfg?.enabled === false ? '▶ Nastavi bodovanje' : '⏸ PAUZIRAJ bodovanje (bez nagrada)'}
            </button>

            <PotvrdnoDugme
              tekst="3. Zatvori rat i isplati nagrade"
              potvrda="Sigurno? Nagrade se isplaćuju odmah i ne vraćaju."
              disabled={!!radi || !cfg?.warId}
              klasa="bg-teal-700"
              naKlik={() =>
                akcija('end', async () => {
                  const r = await adminWarEnd({})
                  return r.vec ? 'Rat je već bio zatvoren.' : `Zatvoreno ${r.mecevi} meč(eva).`
                })
              }
            />

            <PotvrdnoDugme
              tekst="✖ Otkaži rat (bez nagrada, briše skorove)"
              potvrda="Ovo briše mečeve i sve skupljene CP. Nema povratka."
              disabled={!!radi || !cfg?.warId}
              klasa="bg-red-600"
              naKlik={() =>
                akcija('cancel', async () => {
                  const r = await adminWarCancel({ potvrda: cfg.warId })
                  return `Otkazan ${r.otkazan}.`
                })
              }
            />

            <div className="flex gap-2">
              <input
                type="date"
                value={danZaObracun}
                onChange={(e) => setDanZaObracun(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
              />
              <button
                onClick={() =>
                  akcija('dan', async () => {
                    const r = await adminWarRecomputeDay({ dan: danZaObracun })
                    return `Obračunat ${r.dan}: ${r.rezultati.length} klan(ova).`
                  })
                }
                disabled={!!radi || !danZaObracun}
                className="shrink-0 rounded-lg bg-slate-200 px-3 text-sm font-bold text-slate-700 disabled:opacity-50"
              >
                Preračunaj bonus dana
              </button>
            </div>
          </div>

          {/* --- Živi skorovi --- */}
          {(st.mecevi || []).length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-bold text-slate-700">Mečevi</h3>
              <div className="mt-1.5 flex flex-col gap-2">
                {st.mecevi.map((m) => (
                  <div key={m.id} className="rounded-xl bg-slate-50 p-2.5 text-xs">
                    <p className="font-bold text-slate-500">
                      {m.id} · {m.grupni ? 'grupni' : '1v1'} · {m.status}
                    </p>
                    {(m.clanIds || []).map((id) => (
                      <p key={id} className="mt-0.5 flex justify-between">
                        <span className="truncate text-slate-700">{m.imena?.[id]?.name || id}</span>
                        <b className={m.winner === id ? 'text-emerald-700' : 'text-slate-600'}>
                          {m.zivi?.[id] ?? 0} CP{m.winner === id ? ' 🏆' : ''}
                        </b>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            onClick={ucitaj}
            className="mt-3 w-full rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-600"
          >
            ↻ Osvježi
          </button>
        </>
      )}
    </section>
  )
}

// Ručno uparivanje — za test fazu, kad automatika po ratingu nije ono što treba.
function RucnoUparivanje({ klanovi, parovi, setParovi }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const uzeti = new Set(parovi.flat())

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-600">Ručno uparivanje (opciono)</p>
      <p className="mt-0.5 text-[11px] text-slate-400">
        Ostavi prazno pa se pari automatski po ratingu.
      </p>
      <div className="mt-2 flex gap-2">
        <select
          value={a}
          onChange={(e) => setA(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        >
          <option value="">klan A…</option>
          {klanovi
            .filter((k) => !uzeti.has(k.id))
            .map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
        </select>
        <select
          value={b}
          onChange={(e) => setB(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
        >
          <option value="">klan B…</option>
          {klanovi
            .filter((k) => !uzeti.has(k.id) && k.id !== a)
            .map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
        </select>
        <button
          onClick={() => {
            if (!a || !b || a === b) return
            setParovi([...parovi, [a, b]])
            setA('')
            setB('')
          }}
          disabled={!a || !b}
          className="shrink-0 rounded-lg bg-teal-700 px-3 text-xs font-bold text-white disabled:opacity-40"
        >
          + par
        </button>
      </div>
      {parovi.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {parovi.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-slate-600">
                {p.map((id) => klanovi.find((k) => k.id === id)?.name || id).join('  vs  ')}
              </span>
              <button
                onClick={() => setParovi(parovi.filter((_, j) => j !== i))}
                className="font-bold text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Dva koraka za sve što se ne može vratiti — isti obrazac kao admin objava.
function PotvrdnoDugme({ tekst, potvrda, naKlik, disabled, klasa }) {
  const [pita, setPita] = useState(false)
  if (!pita) {
    return (
      <button
        onClick={() => setPita(true)}
        disabled={disabled}
        className={`rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${klasa}`}
      >
        {tekst}
      </button>
    )
  }
  return (
    <div className="rounded-xl bg-slate-100 p-2.5">
      <p className="text-xs font-bold text-slate-700">{potvrda}</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            setPita(false)
            naKlik()
          }}
          className={`flex-1 rounded-lg py-2 text-xs font-bold text-white ${klasa}`}
        >
          Da, uradi
        </button>
        <button
          onClick={() => setPita(false)}
          className="flex-1 rounded-lg bg-white py-2 text-xs font-bold text-slate-600"
        >
          Odustani
        </button>
      </div>
    </div>
  )
}
