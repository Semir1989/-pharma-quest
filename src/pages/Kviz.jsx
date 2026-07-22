import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getRandomQuestions } from '../services/questions'
import { saveQuizResult } from '../services/quizResults'
import { levelFromXp, rankFromLevel } from '../utils/levels'
import QuestionScreen from '../components/quiz/QuestionScreen'
import ResultsScreen from '../components/quiz/ResultsScreen'

const QUESTIONS_PER_QUIZ = 10

// Kviz engine (Modul 4): intro → pitanja (tajmer 30s, objašnjenja) → rezultat.
export default function Kviz() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('intro') // intro | loading | playing | results | error
  const [questions, setQuestions] = useState([])
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState([])
  const [earnedXp, setEarnedXp] = useState(0)
  const [levelUp, setLevelUp] = useState(null) // { level, rank, rankChanged } ili null
  const savedRef = useRef(false) // čuvar da se rezultat ne upiše dva puta
  const xpAtStartRef = useRef(0) // XP prije kviza (za detekciju level-upa)

  async function startQuiz() {
    setPhase('loading')
    try {
      const q = await getRandomQuestions(QUESTIONS_PER_QUIZ)
      if (q.length === 0) {
        setPhase('error')
        return
      }
      setQuestions(q)
      setCurrent(0)
      setAnswers([])
      setEarnedXp(0)
      setLevelUp(null)
      savedRef.current = false
      xpAtStartRef.current = profile.xp || 0
      setPhase('playing')
    } catch {
      setPhase('error')
    }
  }

  async function handleNext(selected) {
    const question = questions[current]
    const answer = { question, selected, correct: selected === question.correctIndex }
    const allAnswers = [...answers, answer]
    setAnswers(allAnswers)

    if (current + 1 < questions.length) {
      setCurrent(current + 1)
      return
    }

    // Kraj kviza — upiši XP i statistiku (jednom).
    setPhase('results')
    if (!savedRef.current) {
      savedRef.current = true
      let xp
      try {
        xp = await saveQuizResult(user.uid, profile, allAnswers)
      } catch {
        // Upis nije uspio — rezultat se ipak prikazuje, XP lokalno izračunat.
        xp = allAnswers.reduce((s, a) => s + (a.correct ? a.question.points : 0), 0)
      }
      setEarnedXp(xp)

      // Detekcija level-upa (Modul 5).
      const oldLevel = levelFromXp(xpAtStartRef.current)
      const newLevel = levelFromXp(xpAtStartRef.current + xp)
      if (newLevel > oldLevel) {
        setLevelUp({
          level: newLevel,
          rank: rankFromLevel(newLevel),
          rankChanged: rankFromLevel(newLevel) !== rankFromLevel(oldLevel),
        })
      }
    }
  }

  if (phase === 'playing') {
    return (
      <QuestionScreen
        key={current} // resetuje tajmer i izbor za svako pitanje
        question={questions[current]}
        index={current}
        total={questions.length}
        onNext={handleNext}
      />
    )
  }

  if (phase === 'results') {
    return (
      <ResultsScreen
        answers={answers}
        earnedXp={earnedXp}
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
          Ne mogu učitati pitanja. Provjeri internet konekciju pa pokušaj ponovo.
        </p>
      ) : (
        <p className="mt-2 text-slate-500">
          {QUESTIONS_PER_QUIZ} nasumičnih pitanja · 30 sekundi po pitanju.
          <br />
          Svaki tačan odgovor nosi XP!
        </p>
      )}

      <button
        onClick={startQuiz}
        disabled={phase === 'loading'}
        className="mt-8 w-full max-w-xs rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800 disabled:opacity-60"
      >
        {phase === 'loading' ? 'Učitavam pitanja…' : phase === 'error' ? 'Pokušaj ponovo' : 'Započni kviz ▶'}
      </button>
    </div>
  )
}
