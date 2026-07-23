import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { startQuizSession, submitQuizAnswer } from '../services/quizApi'
import { levelFromXp, rankFromLevel } from '../utils/levels'
import QuestionScreen from '../components/quiz/QuestionScreen'
import ResultsScreen from '../components/quiz/ResultsScreen'

// Kviz (Etapa 6 — server verzija): server bira pitanja, provjerava odgovore
// i dodjeljuje XP. Klijent vodi samo prikaz i prikuplja feedback za pregled.
export default function Kviz() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('intro') // intro | loading | playing | results | error
  const [session, setSession] = useState(null) // { sessionId, total }
  const [question, setQuestion] = useState(null) // trenutno pitanje (bez tačnog odgovora)
  const [answers, setAnswers] = useState([]) // za pregled na rezultatima
  const [summary, setSummary] = useState(null) // { earnedXp, correctCount, total }
  const [levelUp, setLevelUp] = useState(null)
  const xpAtStartRef = useRef(0)

  async function startQuiz() {
    setPhase('loading')
    try {
      const res = await startQuizSession()
      setSession({ sessionId: res.sessionId, total: res.total })
      setQuestion(res.question)
      setAnswers([])
      setSummary(null)
      setLevelUp(null)
      xpAtStartRef.current = profile.xp || 0
      setPhase('playing')
    } catch {
      setPhase('error')
    }
  }

  // Šalje odgovor serveru; bilježi rezultat za pregled na kraju.
  async function handleSubmit(selected) {
    const res = await submitQuizAnswer(session.sessionId, selected)
    setAnswers((prev) => [
      ...prev,
      {
        question: {
          ...question,
          correctIndex: res.correctIndex,
          explanation: res.explanation,
        },
        selected,
        correct: res.correct,
      },
    ])
    if (res.finished) {
      setSummary(res.summary)
      // Detekcija level-upa (server je već upisao XP u profil).
      const oldLevel = levelFromXp(xpAtStartRef.current)
      const newLevel = levelFromXp(xpAtStartRef.current + res.summary.earnedXp)
      if (newLevel > oldLevel) {
        setLevelUp({
          level: newLevel,
          rank: rankFromLevel(newLevel),
          rankChanged: rankFromLevel(newLevel) !== rankFromLevel(oldLevel),
        })
      }
    }
    return res
  }

  function handleNext(feedback) {
    if (feedback.finished) {
      setPhase('results')
    } else {
      setQuestion(feedback.question)
    }
  }

  if (phase === 'playing' && question) {
    return (
      <QuestionScreen
        key={question.index} // resetuje tajmer i izbor za svako pitanje
        question={question}
        total={session.total}
        onSubmit={handleSubmit}
        onNext={handleNext}
      />
    )
  }

  if (phase === 'results') {
    return (
      <ResultsScreen
        answers={answers}
        earnedXp={summary?.earnedXp || 0}
        levelUp={levelUp}
        onLevelUpSeen={() => setLevelUp(null)}
        onContinue={() => navigate('/')}
      />
    )
  }

  // Intro / loading / error
  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6 text-center">
      <span className="text-6xl">🧪</span>
      <h1 className="mt-4 font-title text-3xl font-extrabold text-slate-900">Kviz</h1>

      {phase === 'error' ? (
        <p className="mt-2 text-slate-500">
          Ne mogu pokrenuti kviz. Provjeri internet konekciju pa pokušaj ponovo.
        </p>
      ) : (
        <p className="mt-2 text-slate-500">
          10 nasumičnih pitanja · 30 sekundi po pitanju.
          <br />
          Svaki tačan odgovor nosi XP!
        </p>
      )}

      <button
        onClick={startQuiz}
        disabled={phase === 'loading'}
        className="mt-8 w-full max-w-xs rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800 disabled:opacity-60"
      >
        {phase === 'loading' ? 'Pokrećem kviz…' : phase === 'error' ? 'Pokušaj ponovo' : 'Započni kviz ▶'}
      </button>
    </div>
  )
}
