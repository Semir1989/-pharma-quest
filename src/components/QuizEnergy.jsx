import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNow } from '../utils/useNow'
import { formatCountdown } from '../utils/periods'
import { QUIZ_ENERGY_MAX, quizEnergy, rewardCounts } from '../utils/quizEnergy'
import { spendQuizRefill } from '../services/quizApi'
import { track } from '../services/analytics'

// Pokušaji za kviz na početnoj.
//
// Nije više prost dnevni brojač: pokušaji rade kao energija — 3 odjednom, novi
// dan puni na 3, i po jedan se regeneriše svaka 4 sata. Bez toga je igra izvan
// vikend eventa bila gotova poslije tri kviza.
//
// Kad su pokušaji prazni a igrač ima žeton iz kovčega, nudi mu se da ga
// potroši. Žeton nikad ne diže strop iznad 3 — samo puni prazno.
export default function QuizEnergy({ profile }) {
  const now = useNow(1000)
  const [trosi, setTrosi] = useState(false)
  const [greska, setGreska] = useState('')

  const { energy, regenAt } = quizEnergy(profile, now)
  const { quizRefill } = rewardCounts(profile)
  const pun = energy >= QUIZ_ENERGY_MAX
  const doSljedeceg = regenAt ? Math.max(0, Math.floor((regenAt - now) / 1000)) : 0

  async function potrosiZeton(e) {
    // Kartica je link na /kviz — dugme unutar nje ne smije navigirati.
    e.preventDefault()
    e.stopPropagation()
    if (trosi) return
    setTrosi(true)
    setGreska('')
    try {
      const r = await spendQuizRefill()
      track('quiz_refill_use', { energy: r.energy })
    } catch (err) {
      setGreska(err?.message || 'Nije uspjelo, pokušaj ponovo.')
    } finally {
      setTrosi(false)
    }
  }

  return (
    <Link
      to="/kviz"
      className="mt-3 block rounded-2xl bg-white px-4 py-2.5 shadow-sm active:bg-slate-50"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-600">
          {energy > 0
            ? `Pokušaji za kviz: ${energy}`
            : 'Nemaš pokušaja'}
        </span>
        <span className="flex gap-1.5">
          {Array.from({ length: QUIZ_ENERGY_MAX }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 w-6 rounded-full ${i < energy ? 'bg-amber-400' : 'bg-slate-200'}`}
            />
          ))}
        </span>
      </div>

      {/* Odbrojavanje do sljedećeg pokušaja — samo dok spremnik nije pun */}
      {!pun && regenAt && (
        <p className="mt-1 text-xs text-slate-400">
          Sljedeći pokušaj za{' '}
          <span className="font-bold tabular-nums text-slate-500">
            {formatCountdown(doSljedeceg)}
          </span>
        </p>
      )}

      {/* Žeton iz kovčega — nudi se tek kad ima šta puniti */}
      {!pun && quizRefill > 0 && (
        <button
          onClick={potrosiZeton}
          disabled={trosi}
          className="mt-2 w-full rounded-xl bg-amber-500 py-2 text-sm font-extrabold text-white active:bg-amber-600 disabled:opacity-60"
        >
          {trosi ? 'Trošim…' : `🎟️ Iskoristi žeton (+1 pokušaj) · imaš ${quizRefill}`}
        </button>
      )}

      {greska && <p className="mt-1.5 text-xs font-medium text-red-600">{greska}</p>}
    </Link>
  )
}
