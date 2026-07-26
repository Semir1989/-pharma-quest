import { useCallback, useEffect, useState } from 'react'
import {
  adminEventStatus,
  adminSetTournamentConfig,
  adminSetSurvivalConfig,
  adminForceResolveRound,
  adminRebuildBracket,
  adminCancelTournament,
  adminFinalizeXpRaceNow,
  adminUnfinalizeXpRace,
} from '../../services/quizApi'
import { invalidateTournamentConfig } from '../../services/tournament'

// Kontrola vikend eventa iz admin panela (Prioritet 1).
//
// Vikend eventi su jedino u igri što ima ROK. Do sada se prozor mijenjao samo
// skriptom s računara — ako nešto zapne u subotu uveče, to je prekasno. Ovdje
// su poluge: prozor, pomjeranje, prisilno zatvaranje runde, ponovna izgradnja
// bracketa, otkazivanje i finalizacija XP trke.
//
// Sve termine unosiš i vidiš po BiH vremenu; prema serveru idu kao ms epoch.

const H = 3600000

// <input type="datetime-local"> radi u LOKALNOJ zoni pregledača. Admin je u
// BiH, pa je to isto — ali konverzija ide preko eksplicitnog offseta da se
// ne oslanjamo na to gdje admin sjedi.
function msUlokalni(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function lokalniUms(v) {
  if (!v) return 0
  return new Date(v).getTime()
}

const bih = (ms) =>
  ms
    ? new Intl.DateTimeFormat('bs-BA', {
        timeZone: 'Europe/Sarajevo',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(ms))
    : '—'

export default function EventKontrola() {
  const [stanje, setStanje] = useState(null)
  const [poruka, setPoruka] = useState('')
  const [radi, setRadi] = useState('')
  const [t, setT] = useState(null) // radna kopija prozora turnira
  const [s, setS] = useState(null) // radna kopija prozora Preživljavanja

  const ucitaj = useCallback(async () => {
    const st = await adminEventStatus()
    setStanje(st)
    setT({
      enabled: st.tournament?.enabled !== false,
      key: st.tournament?.key || '',
      label: st.tournament?.label || 'Vikend turnir',
      regOpenAt: st.tournament?.regOpenAt || 0,
      regCloseAt: st.tournament?.regCloseAt || 0,
      openAt: st.tournament?.openAt || 0,
      closeAt: st.tournament?.closeAt || 0,
    })
    setS({
      enabled: st.survival?.enabled !== false,
      openAt: st.survival?.openAt || 0,
      closeAt: st.survival?.closeAt || 0,
    })
  }, [])

  useEffect(() => {
    ucitaj().catch((e) => setPoruka('Greška pri učitavanju: ' + (e?.message || '')))
  }, [ucitaj])

  async function pokreni(kljuc, fn, uspjeh) {
    if (radi) return
    setRadi(kljuc)
    setPoruka('')
    try {
      await fn()
      invalidateTournamentConfig()
      await ucitaj()
      setPoruka(uspjeh)
    } catch (e) {
      setPoruka('Greška: ' + (e?.message || 'pokušaj ponovo'))
    } finally {
      setRadi('')
    }
  }

  if (!stanje || !t || !s) {
    return (
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-400">Učitavam stanje eventa…</p>
      </section>
    )
  }

  const now = Date.now()
  const faza = !t.enabled
    ? 'ugašen'
    : now < t.regOpenAt
      ? 'prije prijava'
      : now <= t.regCloseAt
        ? 'prijave otvorene'
        : now < t.openAt
          ? 'čeka početak'
          : now <= t.closeAt
            ? 'IGRA U TOKU'
            : 'završen'

  // Pomjeranje cijelog prozora — kad event kasni, sve četiri tačke idu zajedno.
  function pomjeri(sati) {
    setT((x) => ({
      ...x,
      regOpenAt: x.regOpenAt + sati * H,
      regCloseAt: x.regCloseAt + sati * H,
      openAt: x.openAt + sati * H,
      closeAt: x.closeAt + sati * H,
    }))
  }

  return (
    <section className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-4">
      <h2 className="font-title text-lg font-extrabold text-teal-900">📅 Kontrola eventa</h2>
      <p className="mt-0.5 text-xs text-teal-700">
        Server kešira config 30 s — izmjena stupa na snagu najkasnije za pola minute.
      </p>

      {/* --- Turnir --- */}
      <div className="mt-3 rounded-xl bg-white p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Vikend turnir</p>
          <span
            className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${
              faza === 'IGRA U TOKU'
                ? 'bg-emerald-100 text-emerald-700'
                : faza === 'ugašen'
                  ? 'bg-slate-100 text-slate-500'
                  : 'bg-amber-100 text-amber-700'
            }`}
          >
            {faza}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <Polje label="Prijave od" value={t.regOpenAt} onChange={(v) => setT({ ...t, regOpenAt: v })} />
          <Polje label="Prijave do" value={t.regCloseAt} onChange={(v) => setT({ ...t, regCloseAt: v })} />
          <Polje label="Igra od" value={t.openAt} onChange={(v) => setT({ ...t, openAt: v })} />
          <Polje label="Igra do" value={t.closeAt} onChange={(v) => setT({ ...t, closeAt: v })} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Pomjeri sve:</span>
          {[-24, -1, 1, 24].map((h) => (
            <button
              key={h}
              onClick={() => pomjeri(h)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 active:bg-slate-50"
            >
              {h > 0 ? `+${h}h` : `${h}h`}
            </button>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-slate-500">
            Ključ eventa
            <input
              value={t.key}
              onChange={(e) => setT({ ...t, key: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-teal-500"
            />
          </label>
          <label className="mt-5 flex items-center gap-2 text-xs font-bold text-slate-600">
            <input
              type="checkbox"
              checked={t.enabled}
              onChange={(e) => setT({ ...t, enabled: e.target.checked })}
              className="h-4 w-4"
            />
            Uključen
          </label>
        </div>

        {stanje.tournament?.key && t.key !== stanje.tournament.key && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-700">
            Mijenjaš ključ eventa — bracket, prijave i XP trka žive pod ključem, pa ovo pravi
            potpuno NOV event. Stari podaci ostaju netaknuti pod „{stanje.tournament.key}".
          </p>
        )}

        <button
          onClick={() =>
            pokreni('tcfg', () => adminSetTournamentConfig(t), 'Prozor turnira spremljen.')
          }
          disabled={!!radi}
          className="mt-2 w-full rounded-xl bg-teal-700 py-2.5 text-sm font-bold text-white active:bg-teal-800 disabled:opacity-50"
        >
          {radi === 'tcfg' ? 'Spremam…' : 'Spremi prozor turnira'}
        </button>
      </div>

      {/* --- Bracket --- */}
      <div className="mt-2 rounded-xl bg-white p-3">
        <p className="text-sm font-bold text-slate-800">Bracket</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {stanje.turnir
            ? `status: ${stanje.turnir.status}${stanje.turnir.cancelled ? ' (otkazan)' : ''} · runda ${stanje.turnir.currentRound}/${stanje.turnir.rounds} · ${stanje.prijava} prijavljenih`
            : `još nije napravljen · ${stanje.prijava} prijavljenih`}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Dugme
            radi={radi === 'round'}
            onClick={() =>
              pokreni('round', adminForceResolveRound, 'Runda zatvorena.')
            }
          >
            Zatvori rundu
          </Dugme>
          <Dugme
            radi={radi === 'rebuild'}
            tip="tamno"
            onClick={() =>
              pokreni('rebuild', adminRebuildBracket, 'Bracket napravljen nanovo.')
            }
          >
            Napravi bracket nanovo
          </Dugme>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Dugme
            radi={radi === 'cancel'}
            tip="opasno"
            onClick={() =>
              pokreni('cancel', () => adminCancelTournament(false), 'Turnir otkazan i ugašen.')
            }
          >
            Otkaži turnir
          </Dugme>
          <Dugme
            radi={radi === 'cancelp'}
            tip="opasno"
            onClick={() =>
              pokreni(
                'cancelp',
                () => adminCancelTournament(true),
                'Turnir otkazan, prijave obrisane.'
              )
            }
          >
            Otkaži + obriši prijave
          </Dugme>
        </div>
      </div>

      {/* --- XP trka --- */}
      <div className="mt-2 rounded-xl bg-white p-3">
        <p className="text-sm font-bold text-slate-800">XP trka</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {stanje.xpTrka?.finalized ? 'finalizovana ✓' : 'nije finalizovana'}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Dugme
            radi={radi === 'fin'}
            onClick={() =>
              pokreni('fin', adminFinalizeXpRaceNow, 'XP trka finalizovana, nagrade isplaćene.')
            }
          >
            Finalizuj odmah
          </Dugme>
          <Dugme
            radi={radi === 'unfin'}
            tip="opasno"
            onClick={() => {
              if (
                !window.confirm(
                  'Poništavanje znači da će nagrade (500/300/150 XP) biti isplaćene PONOVO pri sljedećoj finalizaciji. Nastaviti?'
                )
              )
                return
              pokreni('unfin', adminUnfinalizeXpRace, 'Finalizacija poništena.')
            }}
          >
            Poništi finalizaciju
          </Dugme>
        </div>
      </div>

      {/* --- Preživljavanje --- */}
      <div className="mt-2 rounded-xl bg-white p-3">
        <p className="text-sm font-bold text-slate-800">Preživljavanje</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {bih(s.openAt)} → {bih(s.closeAt)}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <Polje label="Otvoreno od" value={s.openAt} onChange={(v) => setS({ ...s, openAt: v })} />
          <Polje label="Zatvoreno" value={s.closeAt} onChange={(v) => setS({ ...s, closeAt: v })} />
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-600">
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={(e) => setS({ ...s, enabled: e.target.checked })}
            className="h-4 w-4"
          />
          Uključen (isključeno = nema gejta, uvijek otvoreno)
        </label>
        <button
          onClick={() =>
            pokreni('scfg', () => adminSetSurvivalConfig(s), 'Prozor Preživljavanja spremljen.')
          }
          disabled={!!radi}
          className="mt-2 w-full rounded-xl bg-teal-700 py-2.5 text-sm font-bold text-white active:bg-teal-800 disabled:opacity-50"
        >
          {radi === 'scfg' ? 'Spremam…' : 'Spremi prozor Preživljavanja'}
        </button>
      </div>

      {poruka && (
        <p
          className={`mt-3 text-sm font-medium ${
            poruka.startsWith('Greška') ? 'text-red-600' : 'text-emerald-700'
          }`}
        >
          {poruka}
        </p>
      )}
    </section>
  )
}

function Polje({ label, value, onChange }) {
  return (
    <label className="font-semibold text-slate-500">
      {label}
      <input
        type="datetime-local"
        value={msUlokalni(value)}
        onChange={(e) => onChange(lokalniUms(e.target.value))}
        className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-teal-500"
      />
      <span className="mt-0.5 block text-[10px] font-normal text-slate-400">{bih(value)}</span>
    </label>
  )
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
