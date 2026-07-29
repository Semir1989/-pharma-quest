import { useEffect, useRef, useState } from 'react'

const LETTERS = ['A', 'B', 'C', 'D']

// Ekran pitanja u DUELU — namjerno odvojen od QuestionScreen (kviz).
//
// Tri razlike koje ne trpe zajedničku komponentu:
//   1. jedan tajmer za svih 10 pitanja (120 s), a ne 30 s po pitanju;
//   2. poslije odgovora NEMA feedbacka ni dugmeta — sljedeće pitanje ide odmah,
//      a tačni odgovori i objašnjenja se gledaju na kraju;
//   3. nema pauze na povratak u aplikaciju: sat teče, jer je vrijeme ovdje i
//      kriterij za neriješen rezultat.
//
// props: question ({ index, text, options, points }), total, deadline (ms),
//        totalSeconds, onAnswer(index), onTimeout(), caka (čeka se server)
export default function DuelQuestionScreen({
  question,
  total,
  deadline,
  totalSeconds,
  onAnswer,
  onTimeout,
  caka,
}) {
  const [selected, setSelected] = useState(undefined)
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
  )
  const istekloRef = useRef(false)

  // Novo pitanje → novi izbor. Tajmer se NE dira: on je zajednički za duel.
  useEffect(() => setSelected(undefined), [question.index])

  useEffect(() => {
    const t = setInterval(() => {
      const ostalo = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setSeconds(ostalo)
      // Guard: interval kuca na 250 ms, a kraj se smije javiti samo jednom.
      if (ostalo === 0 && !istekloRef.current) {
        istekloRef.current = true
        onTimeout()
      }
    }, 250)
    return () => clearInterval(t)
  }, [deadline, onTimeout])

  const udio = Math.max(0, Math.min(1, seconds / (totalSeconds || 120)))
  const zadnjih15 = seconds <= 15
  const zakljucano = selected !== undefined || caka

  function izaberi(i) {
    if (zakljucano) return
    setSelected(i)
    onAnswer(i)
  }

  return (
    <div className="flex min-h-svh flex-col p-5 pb-8">
      {/* Gornji red: koje je pitanje + ukupno vrijeme */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-500">
          Pitanje {question.index + 1}/{total}
        </span>
        <span
          className={`rounded-xl px-3 py-1 font-mono text-lg font-bold tabular-nums ${
            zadnjih15 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
      </div>

      {/* Traka ukupnog vremena — jedina mjera napretka u duelu */}
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-2.5 rounded-full transition-[width] duration-200 ease-linear ${
            zadnjih15 ? 'bg-red-500' : 'bg-teal-700'
          }`}
          style={{ width: `${udio * 100}%` }}
        />
      </div>

      {/* Kartica pitanja */}
      <div className="mt-6 rounded-2xl bg-white px-5 py-8 text-center shadow-sm">
        <h2 className="whitespace-pre-line font-title text-xl font-extrabold leading-snug text-slate-900">
          {question.text}
        </h2>
      </div>

      {/* Opcije — bez bojenja tačnog/netačnog, to se vidi tek na kraju */}
      <div className="mt-5 flex flex-col gap-3">
        {question.options.map((option, i) => (
          <button
            key={i}
            disabled={zakljucano}
            onClick={() => izaberi(i)}
            className={`flex items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-left transition-colors ${
              i === selected
                ? 'border-teal-600 bg-teal-600 text-white'
                : selected !== undefined
                  ? 'border-slate-200 bg-white text-slate-400'
                  : 'border-teal-600 bg-white text-slate-800 active:bg-teal-50'
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-bold ${
                i === selected ? 'border-white text-white' : 'border-teal-600 text-teal-700'
              }`}
            >
              {LETTERS[i]}
            </span>
            <span className="font-medium">{option}</span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        Tačni odgovori i objašnjenja čekaju te na kraju duela.
      </p>
    </div>
  )
}
