import { useCallback, useEffect, useState } from 'react'
import {
  adminTurnirPregled,
  adminSetRoundDeadlines,
  adminPruneEmptyMatches,
  adminSetMatchWinner,
  adminResetDuel,
  adminZatvoriZaglavljene,
  adminPodsjetiNeodigrale,
  adminForceResolveRound,
  adminRebuildBracket,
} from '../../services/quizApi'

// Kontrola 1v1 turnira iz admin panela.
//
// Turnir je jedini dio igre s ROKOM: greška u subotu uveče ne može čekati
// ponedjeljak. Ovdje je sve što je do sada tražilo ručnu izmjenu u bazi:
//
//   • ko je odigrao i s koliko tačnih — ČIM odigra (igračima ostaje skriveno
//     do zatvaranja runde, to se ne mijenja);
//   • rokovi rundi, s prijedlogom po BiH terminima (08/14/20);
//   • ručno proglašavanje pobjednika meča (žalba, pokvareno pitanje);
//   • vraćanje zaglavljenog duela i zatvaranje sesija kojima je vrijeme isteklo;
//   • čišćenje praznih mečeva iz prevelikog bracketa;
//   • podsjetnik onima koji još nisu odigrali.
//
// Panel se sam osvježava svakih 20 s dok je otvoren — skor stiže bez reloada.

const OSVJEZI_MS = 20000

const bih = (ms) =>
  ms
    ? new Intl.DateTimeFormat('bs-BA', {
        timeZone: 'Europe/Sarajevo',
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(ms))
    : '—'

const sat = (ms) =>
  ms
    ? new Intl.DateTimeFormat('bs-BA', {
        timeZone: 'Europe/Sarajevo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(ms))
    : '—'

function msUlokalni(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function TurnirKontrola() {
  const [p, setP] = useState(null)
  const [greska, setGreska] = useState('')
  const [poruka, setPoruka] = useState('')
  const [radi, setRadi] = useState('')
  const [runda, setRunda] = useState(0) // koja se runda gleda (0 = tekuća)
  const [rokovi, setRokovi] = useState(null) // radna kopija rasporeda

  const ucitaj = useCallback(async (tiho = false) => {
    try {
      const d = await adminTurnirPregled()
      setP(d)
      setRokovi((stari) => (stari && tiho ? stari : d.roundDeadlines || []))
      setGreska('')
    } catch (e) {
      setGreska(e?.message || 'Greška pri učitavanju.')
    }
  }, [])

  useEffect(() => {
    ucitaj()
  }, [ucitaj])

  // Živo osvježavanje: skor se upisuje u meč čim igrač preda, pa panel ne smije
  // biti snimak od prije pola sata.
  useEffect(() => {
    const t = setInterval(() => ucitaj(true), OSVJEZI_MS)
    return () => clearInterval(t)
  }, [ucitaj])

  async function pokreni(kljuc, fn, uspjeh) {
    if (radi) return
    setRadi(kljuc)
    setPoruka('')
    setGreska('')
    try {
      const r = await fn()
      await ucitaj()
      setPoruka(typeof uspjeh === 'function' ? uspjeh(r) : uspjeh)
    } catch (e) {
      setGreska('Greška: ' + (e?.message || 'pokušaj ponovo'))
    } finally {
      setRadi('')
    }
  }

  if (!p) {
    return (
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-400">{greska || 'Učitavam stanje turnira…'}</p>
      </section>
    )
  }

  if (p.nema) {
    return (
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-title text-lg font-extrabold text-slate-800">⚔️ 1v1 turnir</h2>
        <p className="mt-1 text-sm text-slate-500">Nema aktivnog turnira (config/tournament).</p>
      </section>
    )
  }

  if (!p.bracket) {
    return (
      <section className="mt-4 rounded-2xl border border-slate-300 bg-white p-4">
        <h2 className="font-title text-lg font-extrabold text-slate-800">⚔️ 1v1 turnir</h2>
        <p className="mt-1 text-sm text-slate-500">
          Bracket još nije napravljen · {p.ucesnici.length} prijavljenih. Pravi se automatski na
          zatvaranju prijava.
        </p>
        <Ucesnici lista={p.ucesnici} />
      </section>
    )
  }

  const gledana = runda || p.currentRound || 1
  const meceviRunde = p.mecevi.filter((m) => m.round === gledana)
  const odigrali = meceviRunde.filter((m) => m.p1 && m.p2)
  const cekaSe = odigrali.reduce((n, m) => n + (m.p1Played ? 0 : 1) + (m.p2Played ? 0 : 1), 0)

  return (
    <section className="mt-4 rounded-2xl border border-slate-300 bg-slate-100 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-title text-lg font-extrabold text-slate-800">⚔️ 1v1 turnir</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            {p.tid} · {p.status}
            {p.cancelled ? ' (otkazan)' : ''} · runda {p.currentRound}/{p.rounds} ·{' '}
            {p.ucesnici.length} učesnika
          </p>
        </div>
        <button
          onClick={() => ucitaj()}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-600 active:bg-slate-50"
        >
          Osvježi
        </button>
      </div>

      {/* --- Šta je pošlo po zlu --- */}
      {p.problemi.length > 0 && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-bold text-red-800">⚠ Zapelo je ovo:</p>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-xs text-red-700">
            {p.problemi.map((x, i) => (
              <li key={i}>{x.tekst}</li>
            ))}
          </ul>
        </div>
      )}

      {/* --- Rezultati runde: ono zbog čega panel postoji --- */}
      <div className="mt-3 rounded-xl bg-white p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Rezultati po meču</p>
          <select
            value={gledana}
            onChange={(e) => setRunda(Number(e.target.value))}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-700 outline-none"
          >
            {Array.from({ length: p.rounds }, (_, i) => i + 1).map((r) => (
              <option key={r} value={r}>
                Runda {r}
                {r === p.currentRound ? ' (tekuća)' : ''}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {odigrali.length} pravih mečeva · čeka se {cekaSe}{' '}
          {cekaSe === 1 ? 'igrač' : 'igrača'} · rok {bih(p.roundDeadlines[gledana - 1])}
        </p>

        <div className="mt-2 flex flex-col gap-1.5">
          {meceviRunde.length === 0 && (
            <p className="py-2 text-center text-xs text-slate-400">Nema mečeva u ovoj rundi.</p>
          )}
          {meceviRunde.map((m) => (
            <MecRed
              key={m.id}
              m={m}
              radi={radi}
              onPobjednik={(w) =>
                pokreni(`w-${m.id}`, () => adminSetMatchWinner(m.id, w), 'Pobjednik postavljen.')
              }
              onReset={(uid, ime) => {
                if (!window.confirm(`Obrisati rezultat: ${ime}? Moći će odigrati duel iznova.`)) return
                pokreni(`r-${m.id}-${uid}`, () => adminResetDuel(uid, m.id), 'Duel vraćen na početak.')
              }}
            />
          ))}
        </div>
      </div>

      {/* --- Raspored rundi --- */}
      <div className="mt-2 rounded-xl bg-white p-3">
        <p className="text-sm font-bold text-slate-800">Raspored rundi</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Prijedlog stavlja rokove u 08:00 / 14:00 / 20:00 po BiH vremenu — prva runda ujutro
          nakon početka, pa redom. Runde nikad ne završavaju noću.
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {(rokovi || []).map((r, i) => (
            <label key={i} className="flex items-center gap-2 text-xs">
              <span
                className={`w-16 shrink-0 font-bold ${
                  i + 1 < p.currentRound ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                Runda {i + 1}
              </span>
              <input
                type="datetime-local"
                value={msUlokalni(r)}
                onChange={(e) => {
                  const v = new Date(e.target.value).getTime()
                  setRokovi((x) => x.map((y, j) => (j === i ? v : y)))
                }}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-800 outline-none focus:border-teal-500"
              />
              <span className="w-24 shrink-0 text-right text-[10px] text-slate-400">{bih(r)}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Dugme
            radi={radi === 'rokovi'}
            onClick={() =>
              pokreni('rokovi', () => adminSetRoundDeadlines(rokovi), 'Raspored spremljen.')
            }
          >
            Spremi raspored
          </Dugme>
          <Dugme
            radi={radi === 'auto'}
            tip="tamno"
            onClick={() =>
              pokreni(
                'auto',
                () => adminSetRoundDeadlines('auto'),
                (r) => `Raspored postavljen po BiH terminima (${r.roundDeadlines.map(sat).join(', ')}).`
              )
            }
          >
            Predloži po BiH terminima
          </Dugme>
        </div>
      </div>

      {/* --- Poluge --- */}
      <div className="mt-2 rounded-xl bg-white p-3">
        <p className="text-sm font-bold text-slate-800">Poluge</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Dugme
            radi={radi === 'round'}
            onClick={() => {
              if (!window.confirm(`Zatvoriti rundu ${p.currentRound} odmah? Ko nije odigrao — ispada.`))
                return
              pokreni('round', adminForceResolveRound, 'Runda zatvorena.')
            }}
          >
            Zatvori rundu
          </Dugme>
          <Dugme
            radi={radi === 'podsjeti'}
            onClick={() =>
              pokreni(
                'podsjeti',
                adminPodsjetiNeodigrale,
                (r) =>
                  `Podsjetnik poslan: ${r.poslano}/${r.kome}` +
                  (r.bezUredjaja ? ` · ${r.bezUredjaja} bez uređaja` : '') +
                  (r.odjavljenih ? ` · ${r.odjavljenih} odjavljenih` : '')
              )
            }
          >
            Podsjeti neodigrale ({p.neodigrali.length})
          </Dugme>
          <Dugme
            radi={radi === 'prune'}
            tip="tamno"
            onClick={() =>
              pokreni(
                'prune',
                adminPruneEmptyMatches,
                (r) =>
                  r.obrisano === 0
                    ? 'Nema praznih mečeva — bracket je uredan.'
                    : `Obrisano ${r.obrisano} praznih mečeva.`
              )
            }
          >
            Očisti prazne mečeve
          </Dugme>
          <Dugme
            radi={radi === 'zaglavljene'}
            tip="tamno"
            onClick={() =>
              pokreni(
                'zaglavljene',
                adminZatvoriZaglavljene,
                (r) => `Zatvoreno zaglavljenih duela: ${r.zatvoreno}.`
              )
            }
          >
            Zatvori zaglavljene ({p.zaglavljene.length})
          </Dugme>
          <Dugme
            radi={radi === 'rebuild'}
            tip="opasno"
            onClick={() => {
              if (
                !window.confirm(
                  'Bracket se pravi NANOVO iz trenutnih prijava. Svi odigrani mečevi i skorovi se BRIŠU. Nastaviti?'
                )
              )
                return
              pokreni('rebuild', adminRebuildBracket, 'Bracket napravljen nanovo.')
            }}
          >
            Napravi bracket nanovo
          </Dugme>
        </div>
      </div>

      {/* --- Zaglavljeni duel po igraču --- */}
      {p.zaglavljene.length > 0 && (
        <div className="mt-2 rounded-xl bg-white p-3">
          <p className="text-sm font-bold text-slate-800">Otvoreni duel, vrijeme isteklo</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Skor se upisuje tek kad igrač ponovo otvori ekran. Do tada meč izgleda kao da nije
            igran.
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {p.zaglavljene.map((z) => (
              <p key={z.uid} className="text-xs text-slate-600">
                <b>{z.ime}</b> · {z.matchId} · odgovorio {z.odgovoreno}/10 · prije {z.minuta} min
              </p>
            ))}
          </div>
        </div>
      )}

      <Ucesnici lista={p.ucesnici} />

      {poruka && <p className="mt-3 text-sm font-medium text-emerald-700">{poruka}</p>}
      {greska && <p className="mt-3 text-sm font-medium text-red-600">{greska}</p>}
    </section>
  )
}

// Jedan meč: imena, ko je odigrao, koliko tačnih, i poluge nad njim.
function MecRed({ m, radi, onPobjednik, onReset }) {
  const [otvoren, setOtvoren] = useState(false)
  const bye = (m.p1 && !m.p2) || (m.p2 && !m.p1)
  const prazan = !m.p1 && !m.p2
  const gotov = m.status === 'done'

  return (
    <div
      className={`rounded-lg border px-2.5 py-2 text-xs ${
        prazan ? 'border-dashed border-slate-200 bg-slate-50' : 'border-slate-200'
      }`}
    >
      <button onClick={() => setOtvoren((x) => !x)} className="flex w-full items-center gap-2 text-left">
        <span className="w-10 shrink-0 font-mono text-[10px] text-slate-400">{m.id}</span>
        <span className="min-w-0 flex-1">
          {prazan ? (
            <span className="text-slate-400">prazan meč</span>
          ) : (
            <>
              <Strana ime={m.p1Ime} score={m.p1Score} played={m.p1Played} gotov={gotov} pobjednik={m.winner === m.p1} />
              <span className="mx-1 text-slate-300">vs</span>
              {m.kvalifikacija ? (
                <span className="font-bold text-amber-700">kvalifikacija 6/10</span>
              ) : bye ? (
                <span className="text-slate-400">bye</span>
              ) : (
                <Strana ime={m.p2Ime} score={m.p2Score} played={m.p2Played} gotov={gotov} pobjednik={m.winner === m.p2} />
              )}
            </>
          )}
        </span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
            gotov ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {gotov ? 'zatvoren' : 'otvoren'}
        </span>
      </button>

      {otvoren && !prazan && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <p className="text-[11px] text-slate-500">
            {m.p1Ime}: {m.p1Played ? `${m.p1Score}/10 · ${vrijeme(m.p1FinishedAt)}` : 'nije odigrao'}
            {!bye && (
              <>
                {' · '}
                {m.p2Ime}: {m.p2Played ? `${m.p2Score}/10 · ${vrijeme(m.p2FinishedAt)}` : 'nije odigrao'}
              </>
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {!gotov && m.p1 && (
              <Mini onClick={() => onPobjednik(m.p1)} radi={radi === `w-${m.id}`}>
                Prolazi {m.p1Ime}
              </Mini>
            )}
            {!gotov && m.p2 && (
              <Mini onClick={() => onPobjednik(m.p2)} radi={radi === `w-${m.id}`}>
                Prolazi {m.p2Ime}
              </Mini>
            )}
            {!gotov && m.p1Played && (
              <Mini tip="opasno" onClick={() => onReset(m.p1, m.p1Ime)} radi={radi === `r-${m.id}-${m.p1}`}>
                Poništi {m.p1Ime}
              </Mini>
            )}
            {!gotov && m.p2Played && (
              <Mini tip="opasno" onClick={() => onReset(m.p2, m.p2Ime)} radi={radi === `r-${m.id}-${m.p2}`}>
                Poništi {m.p2Ime}
              </Mini>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Ime s brojem tačnih. Skor se adminu vidi ODMAH — igračima i dalje tek na
// zatvaranju runde (to radi server, ovdje se samo prikazuje).
function Strana({ ime, score, played, gotov, pobjednik }) {
  return (
    <span className={pobjednik && gotov ? 'font-extrabold text-teal-700' : 'text-slate-700'}>
      {ime || '—'}
      {played ? (
        <b className="ml-1 rounded bg-emerald-50 px-1 tabular-nums text-emerald-700">{score}/10</b>
      ) : (
        <span className="ml-1 text-slate-300">—</span>
      )}
    </span>
  )
}

function Ucesnici({ lista }) {
  const [otvoren, setOtvoren] = useState(false)
  if (!lista?.length) return null
  return (
    <div className="mt-2 rounded-xl bg-white p-3">
      <button
        onClick={() => setOtvoren((x) => !x)}
        className="flex w-full items-center justify-between text-sm font-bold text-slate-800"
      >
        Učesnici ({lista.length})
        <span className="text-xs text-slate-400">{otvoren ? 'sakrij' : 'prikaži'}</span>
      </button>
      {otvoren && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lista.map((u) => (
            <span key={u.uid} className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              {u.ime}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function vrijeme(ms) {
  return ms
    ? new Intl.DateTimeFormat('bs-BA', {
        timeZone: 'Europe/Sarajevo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(ms))
    : '—'
}

function Dugme({ children, onClick, radi, tip }) {
  const stil =
    tip === 'opasno'
      ? 'border border-red-200 bg-red-50 text-red-700 active:bg-red-100'
      : tip === 'tamno'
        ? 'bg-slate-800 text-white active:bg-slate-900'
        : 'bg-teal-700 text-white active:bg-teal-800'
  return (
    <button
      onClick={onClick}
      disabled={radi}
      className={`rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-50 ${stil}`}
    >
      {radi ? '…' : children}
    </button>
  )
}

function Mini({ children, onClick, radi, tip }) {
  return (
    <button
      onClick={onClick}
      disabled={radi}
      className={`rounded-lg px-2 py-1 text-[11px] font-bold disabled:opacity-50 ${
        tip === 'opasno'
          ? 'border border-red-200 bg-red-50 text-red-700'
          : 'border border-teal-200 bg-teal-50 text-teal-700'
      }`}
    >
      {radi ? '…' : children}
    </button>
  )
}
