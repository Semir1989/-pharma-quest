import { Link } from 'react-router-dom'
import { TrophyIcon } from './icons'
import { formatCountdownLong } from '../utils/periods'
import { useNow } from '../utils/useNow'
import { xpTrkaFaza } from '../services/xpTrka'

// Kartica XP trke u Areni. Nema prijave — sav XP osvojen tokom prozora se sam
// sabira (server, addWeekendXp), pa igraču treba odbrojavanje i put do poretka.
//
// Vodi na /xp-trka (vlastita ljestvica eventa), a ne više na duel bracket.
//
// props: cfg (config/xpRace, uz fallback na config/tournament)
export default function XpRaceCard({ cfg }) {
  const now = useNow()
  const faza = xpTrkaFaza(cfg, now)

  if (faza === 'off') return null

  return (
    <div className="mt-4 rounded-2xl border-2 border-amber-500 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <TrophyIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-800">XP trka</h2>
          <p className="text-xs text-slate-500">
            {faza === 'live'
              ? 'Sav XP koji osvojiš se broji — kviz, questovi, Preživljavanje'
              : 'Bez prijave — samo skupljaj XP dok traje'}
          </p>
        </div>
      </div>

      {faza !== 'ended' && (
        <div className="mt-3 flex items-baseline justify-between rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="text-xs font-semibold text-slate-500">
            {faza === 'pre' ? 'Počinje za' : 'Završava za'}
          </span>
          <span className="font-title text-lg font-extrabold tabular-nums text-amber-600">
            {formatCountdownLong(((faza === 'pre' ? cfg.openAt : cfg.closeAt) - now) / 1000)}
          </span>
        </div>
      )}

      {faza === 'live' && (
        <Link
          to="/xp-trka"
          className="mt-3 block w-full rounded-2xl bg-amber-500 py-3.5 text-center font-title font-extrabold text-white active:bg-amber-600"
        >
          Pogledaj poredak →
        </Link>
      )}

      {faza === 'ended' && (
        <Link
          to="/xp-trka"
          className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 active:bg-slate-100"
        >
          <span className="text-sm font-semibold text-slate-600">Trka je završena</span>
          <span className="text-sm font-bold text-amber-600">Rezultati →</span>
        </Link>
      )}
    </div>
  )
}
