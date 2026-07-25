import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isRegisteredForDuel, countDuelParticipants } from '../services/tournament'
import { registerForDuel } from '../services/quizApi'
import { track } from '../services/analytics'
import { formatCountdownLong } from '../utils/periods'
import { useNow } from '../utils/useNow'

// Kartica 1v1 duel turnira na početnoj.
// Prijava se radi ODAVDE — igrač ne mora ulaziti u /turnir da bi se prijavio.
// Ulazak u turnir (bracket, borbe) nudi se tek kad igra počne.
//
// props: cfg (config/tournament), uid
export default function DuelCard({ cfg, uid }) {
  const now = useNow()
  const [registered, setRegistered] = useState(false)
  const [count, setCount] = useState(0)
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!cfg?.key || !uid) return
    let alive = true
    isRegisteredForDuel(cfg.key, uid).then((r) => alive && setRegistered(r))
    countDuelParticipants(cfg.key).then((c) => alive && setCount(c))
    return () => {
      alive = false
    }
  }, [cfg?.key, uid])

  if (!cfg?.enabled || !cfg.key) return null

  const phase =
    now < cfg.regOpenAt
      ? 'pre'
      : now <= cfg.regCloseAt
        ? 'reg'
        : now < cfg.openAt
          ? 'waiting'
          : now <= cfg.closeAt
            ? 'live'
            : 'ended'

  async function prijavi() {
    setError('')
    setRegistering(true)
    try {
      await registerForDuel()
      track('tournament_register')
      setRegistered(true)
      setCount((c) => c + 1)
    } catch (e) {
      setError(e?.message || 'Greška pri prijavi. Pokušaj ponovo.')
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-xl">
          ⚔️
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-800">1v1 Dueli</h2>
          <p className="text-xs text-slate-500">
            {phase === 'reg' || phase === 'pre'
              ? 'Nasumično uparivanje, ispadanje do finala'
              : `${count} ${count === 1 ? 'učesnik' : 'učesnika'}`}
          </p>
        </div>
        {registered && phase !== 'ended' && (
          <span className="rounded-lg bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700">
            Prijavljen ✓
          </span>
        )}
      </div>

      {phase === 'pre' && (
        <Countdown label="Prijave se otvaraju za" to={cfg.regOpenAt} now={now} />
      )}

      {phase === 'reg' && (
        <>
          <Countdown
            label={registered ? 'Turnir počinje za' : 'Prijave se zatvaraju za'}
            to={registered ? cfg.openAt : cfg.regCloseAt}
            now={now}
          />
          {!registered && (
            <>
              <button
                onClick={prijavi}
                disabled={registering}
                className="mt-3 w-full rounded-2xl bg-teal-700 py-3.5 font-title font-extrabold text-white active:bg-teal-800 disabled:opacity-60"
              >
                {registering ? 'Prijavljujem…' : 'Prijavi se za duel'}
              </button>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </>
          )}
        </>
      )}

      {phase === 'waiting' && (
        <>
          <Countdown label="Turnir počinje za" to={cfg.openAt} now={now} />
          <p className="mt-2 text-xs text-slate-500">
            {registered
              ? 'Prijave su zatvorene — parovi se izvlače uskoro.'
              : 'Prijave su zatvorene. Bracket možeš pratiti kad turnir počne.'}
          </p>
        </>
      )}

      {phase === 'live' && (
        <>
          <Countdown label="Turnir traje još" to={cfg.closeAt} now={now} />
          <Link
            to="/turnir"
            className="mt-3 block w-full rounded-2xl bg-teal-700 py-3.5 text-center font-title font-extrabold text-white active:bg-teal-800"
          >
            {registered ? 'Uđi u turnir →' : 'Pogledaj bracket →'}
          </Link>
        </>
      )}

      {phase === 'ended' && (
        <Link
          to="/turnir"
          className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 active:bg-slate-100"
        >
          <span className="text-sm font-semibold text-slate-600">Turnir je završen</span>
          <span className="text-sm font-bold text-teal-700">Rezultati →</span>
        </Link>
      )}
    </div>
  )
}

// Natpis + živo odbrojavanje (dani se prikazuju samo kad ih ima).
function Countdown({ label, to, now }) {
  return (
    <div className="mt-3 flex items-baseline justify-between rounded-xl bg-slate-50 px-3 py-2.5">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <span className="font-title text-lg font-extrabold tabular-nums text-teal-700">
        {formatCountdownLong((to - now) / 1000)}
      </span>
    </div>
  )
}
