import { useState } from 'react'
import { motion } from 'framer-motion'

// Ekran rezultata kviza: kružni skor, poruka, osvojeni XP,
// lista pitanja s ✓/✗ i objašnjenjima (klik za otvaranje).
// props: answers = [{ question, selected, correct }], earnedXp, onContinue
export default function ResultsScreen({ answers, earnedXp, onContinue }) {
  const [open, setOpen] = useState({}) // koja su pitanja raširena
  const score = answers.filter((a) => a.correct).length
  const total = answers.length
  const great = score / total >= 0.7

  const toggleAll = () => {
    const anyClosed = answers.some((_, i) => !open[i])
    setOpen(Object.fromEntries(answers.map((_, i) => [i, anyClosed])))
  }

  return (
    <div className="relative min-h-svh overflow-hidden p-5 pb-8">
      {great && <Confetti />}

      {/* Kružni skor */}
      <div className="mt-4 flex justify-center">
        <ScoreCircle score={score} total={total} />
      </div>

      <h1 className="mt-5 text-center font-title text-4xl font-extrabold text-slate-900">
        {message(score, total)}
      </h1>
      <p className="mt-1 text-center text-slate-500">{subMessage(score, total)}</p>

      <div className="mt-4 flex justify-center">
        <span className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-2.5 font-bold text-amber-600">
          ⭐ +{earnedXp} XP osvojeno
        </span>
      </div>

      {/* Pregled pitanja */}
      <div className="mt-6 flex flex-col gap-2">
        {answers.map((a, i) => (
          <div key={i} className="rounded-2xl bg-white shadow-sm">
            <button
              onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
              className="flex w-full items-center justify-between px-4 py-3.5"
            >
              <span className="font-bold text-slate-800">Pitanje {i + 1}</span>
              <span className="flex items-center gap-3">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-sm font-bold ${
                  a.correct
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-red-400 text-red-500'
                }`}>
                  {a.correct ? '✓' : '✗'}
                </span>
                <span className={`text-slate-400 transition-transform ${open[i] ? 'rotate-180' : ''}`}>
                  ▾
                </span>
              </span>
            </button>
            {open[i] && (
              <div className="border-t border-slate-100 px-4 py-3 text-sm">
                <p className="font-medium text-slate-800">{a.question.text}</p>
                {!a.correct && (
                  <p className="mt-2 text-red-600">
                    Tvoj odgovor:{' '}
                    {a.selected === null ? 'isteklo vrijeme' : a.question.options[a.selected]}
                  </p>
                )}
                <p className="mt-1 text-emerald-700">
                  Tačan odgovor: {a.question.options[a.question.correctIndex]}
                </p>
                <p className="mt-2 flex gap-2 leading-relaxed text-slate-600">
                  <span>💡</span>
                  <span>{a.question.explanation}</span>
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Dugmad */}
      <button
        onClick={onContinue}
        className="mt-6 w-full rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800"
      >
        Nastavi →
      </button>
      <button
        onClick={toggleAll}
        className="mt-3 w-full rounded-2xl border-2 border-teal-700 py-3.5 font-title font-extrabold text-teal-700 active:bg-teal-50"
      >
        Pregledaj odgovore
      </button>
    </div>
  )
}

function ScoreCircle({ score, total }) {
  const SIZE = 176
  const STROKE = 12
  const R = (SIZE - STROKE) / 2
  const CIRC = 2 * Math.PI * R
  const ratio = total > 0 ? score / total : 0
  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#e2e8f0" strokeWidth={STROKE} />
        <motion.circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none" stroke="#0f766e" strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={CIRC}
          initial={{ strokeDashoffset: CIRC }}
          animate={{ strokeDashoffset: CIRC * (1 - ratio) }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-title text-5xl font-extrabold text-teal-800">
          {score}<span className="text-3xl text-slate-500">/{total}</span>
        </span>
        <span className="mt-1 text-sm text-slate-500">Tačno odgovoreno</span>
      </div>
    </div>
  )
}

function message(score, total) {
  const r = score / total
  if (r >= 0.9) return 'Savršeno!'
  if (r >= 0.7) return 'Odlično!'
  if (r >= 0.5) return 'Dobro!'
  return 'Ne odustaj!'
}

function subMessage(score, total) {
  const r = score / total
  if (r >= 0.7) return 'Sjajan rezultat! Nastavi tako.'
  if (r >= 0.5) return 'Solidno — vježbom do još boljeg.'
  return 'Svaki kviz te čini boljim farmaceutom.'
}

// Jednostavni konfeti (teal + zlatna) — padaju s vrha ekrana.
const CONFETTI_COLORS = ['#0f766e', '#14b8a6', '#d97706', '#f59e0b']
const PIECES = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: (i % 7) * 0.18,
  duration: 2.4 + ((i * 13) % 10) / 8,
  rotate: ((i * 53) % 360) - 180,
}))

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {PIECES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 block h-2.5 w-2"
          style={{ left: p.left, backgroundColor: p.color, borderRadius: 2 }}
          initial={{ y: -24, opacity: 1, rotate: 0 }}
          animate={{ y: 560, opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}
