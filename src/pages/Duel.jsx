import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startDuel, submitDuelAnswer } from '../services/quizApi'
import { track } from '../services/analytics'
import QuestionScreen from '../components/quiz/QuestionScreen'

// Duel play (Faza 2, korak C) — 10 istih pitanja kao protivnik; skor se upisuje
// u meč, a protivnikov rezultat je skriven do zatvaranja runde.
export default function Duel() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('loading') // loading | playing | done | nomatch | error
  const [question, setQuestion] = useState(null)
  const [total, setTotal] = useState(10)
  const [myScore, setMyScore] = useState(0)

  useEffect(() => {
    let cancelled = false
    startDuel()
      .then((res) => {
        if (cancelled) return
        if (res.noMatch) return setPhase('nomatch')
        if (res.alreadyPlayed) {
          setMyScore(res.score || 0)
          return setPhase('done')
        }
        setTotal(res.total || 10)
        setQuestion(res.question)
        setPhase('playing')
        track('duel_start')
      })
      .catch(() => !cancelled && setPhase('error'))
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(selected) {
    return submitDuelAnswer(selected)
  }

  function handleNext(feedback) {
    if (feedback.finished) {
      setMyScore(feedback.myScore || 0)
      setPhase('done')
    } else {
      setQuestion(feedback.question)
    }
  }

  if (phase === 'playing' && question) {
    return (
      <QuestionScreen
        key={question.index}
        question={question}
        total={total}
        onSubmit={handleSubmit}
        onNext={handleNext}
      />
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6 text-center">
      {phase === 'loading' && <p className="text-slate-400">Pokrećem duel…</p>}

      {phase === 'done' && (
        <>
          <h1 className="font-title text-3xl font-extrabold text-slate-900">Tvoj rezultat</h1>
          <p className="mt-3 font-title text-6xl font-extrabold text-teal-700">
            {myScore}<span className="text-3xl text-slate-400">/{total}</span>
          </p>
          <p className="mt-3 text-slate-500">
            Rezultat protivnika je skriven do zatvaranja runde. Pobjednik prolazi dalje — prati bracket.
          </p>
        </>
      )}

      {phase === 'nomatch' && (
        <>
          <h1 className="font-title text-2xl font-extrabold text-slate-900">Nemaš duel za sada</h1>
          <p className="mt-2 text-slate-500">Nisi u tekućoj rundi ili turnir nije aktivan.</p>
        </>
      )}

      {phase === 'error' && (
        <>
          <h1 className="font-title text-2xl font-extrabold text-slate-900">Greška</h1>
          <p className="mt-2 text-slate-500">Ne mogu pokrenuti duel. Pokušaj ponovo.</p>
        </>
      )}

      {phase !== 'playing' && phase !== 'loading' && (
        <button
          onClick={() => navigate('/turnir')}
          className="mt-8 w-full max-w-xs rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800"
        >
          Nazad na turnir
        </button>
      )}
    </div>
  )
}
