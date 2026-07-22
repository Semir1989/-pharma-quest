import { useEffect, useState } from 'react'
import TimerCircle from './TimerCircle'

const TIMER_SECONDS = 30
const LETTERS = ['A', 'B', 'C', 'D']

// Ekran jednog pitanja: progres, XP oznaka, tajmer, pitanje, 4 opcije.
// Nakon odgovora (ili isteka vremena) prikazuje tačno/netačno + objašnjenje.
// props: question, index (0-based), total, onNext(selectedIndex|null)
export default function QuestionScreen({ question, index, total, onNext }) {
  const [seconds, setSeconds] = useState(TIMER_SECONDS)
  const [selected, setSelected] = useState(undefined) // undefined = još nije odgovoreno

  const answered = selected !== undefined

  // Odbrojavanje — staje kad korisnik odgovori; na 0 se računa kao netačno.
  useEffect(() => {
    if (answered) return
    if (seconds === 0) {
      setSelected(null) // isteklo vrijeme
      return
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds, answered])

  const correct = answered && selected === question.correctIndex

  return (
    <div className="flex min-h-svh flex-col p-5 pb-8">
      {/* Gornji red: progres + XP oznaka */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <span className="text-sm font-bold text-slate-500">
            {index + 1}/{total}
          </span>
          <div className="mt-1 h-2 w-2/3 rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-teal-700 transition-all"
              style={{ width: `${((index + (answered ? 1 : 0)) / total) * 100}%` }}
            />
          </div>
        </div>
        <span className="flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-bold text-amber-600">
          +{question.points} XP ⭐
        </span>
      </div>

      {/* Tajmer */}
      <div className="mt-6 flex justify-center">
        <TimerCircle seconds={seconds} total={TIMER_SECONDS} />
      </div>

      {/* Kartica pitanja */}
      <div className="mt-6 rounded-2xl bg-white px-5 py-8 text-center shadow-sm">
        <h2 className="font-title text-xl font-extrabold leading-snug text-slate-900">
          {question.text}
        </h2>
      </div>

      {/* Opcije */}
      <div className="mt-5 flex flex-col gap-3">
        {question.options.map((option, i) => (
          <button
            key={i}
            disabled={answered}
            onClick={() => setSelected(i)}
            className={`flex items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-left transition-colors ${optionStyle(i, question.correctIndex, selected)}`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-bold ${letterStyle(i, question.correctIndex, selected)}`}>
              {LETTERS[i]}
            </span>
            <span className="font-medium">{option}</span>
          </button>
        ))}
      </div>

      {/* Poslije odgovora: poruka + objašnjenje + dugme dalje */}
      {answered && (
        <div className="mt-4">
          <div className={`rounded-2xl p-4 ${correct ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <p className={`font-bold ${correct ? 'text-emerald-700' : 'text-red-700'}`}>
              {correct
                ? `✓ Tačno! +${question.points} XP`
                : selected === null
                  ? '⏱ Isteklo vrijeme!'
                  : '✗ Netačno.'}
            </p>
            <p className="mt-2 flex gap-2 text-sm leading-relaxed text-slate-600">
              <span>💡</span>
              <span>{question.explanation}</span>
            </p>
          </div>
          <button
            onClick={() => onNext(selected)}
            className="mt-4 w-full rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800"
          >
            {index + 1 === total ? 'Vidi rezultat →' : 'Sljedeće pitanje →'}
          </button>
        </div>
      )}
    </div>
  )
}

// Stil opcije: prije odgovora neutralno; poslije — tačna zelena, izabrana netačna crvena.
function optionStyle(i, correctIndex, selected) {
  if (selected === undefined)
    return 'border-teal-600 bg-white text-slate-800 active:bg-teal-50'
  if (i === correctIndex) return 'border-emerald-500 bg-emerald-50 text-emerald-900'
  if (i === selected) return 'border-red-400 bg-red-50 text-red-800'
  return 'border-slate-200 bg-white text-slate-400'
}

function letterStyle(i, correctIndex, selected) {
  if (selected === undefined) return 'border-teal-600 text-teal-700'
  if (i === correctIndex) return 'border-emerald-500 bg-emerald-500 text-white'
  if (i === selected) return 'border-red-400 bg-red-400 text-white'
  return 'border-slate-200 text-slate-300'
}
