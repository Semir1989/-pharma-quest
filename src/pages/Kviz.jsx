import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { startQuizSession, submitQuizAnswer } from '../services/quizApi'
import { track } from '../services/analytics'
import { levelFromXp, rankFromLevel } from '../utils/levels'
import { dailyKey, formatCountdown, nextDailyResetAt } from '../utils/periods'
import QuestionScreen from '../components/quiz/QuestionScreen'
import ResultsScreen from '../components/quiz/ResultsScreen'

// Fallback vrijednosti za prikaz dok server ne odgovori (izvor istine je server).
const DEFAULT_LIMIT = 3
const DEFAULT_XP_CAP = 300

// Kviz (Etapa 6 — server verzija): server bira pitanja, provjerava odgovore
// i dodjeljuje XP. Klijent vodi samo prikaz i prikuplja feedback za pregled.
// Dnevni limit (3 kviza / 300 XP) drži server — ovdje se samo prikazuje.
export default function Kviz() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('intro') // intro | loading | playing | results | limited | error
  const [session, setSession] = useState(null) // { sessionId, total }
  const [question, setQuestion] = useState(null) // trenutno pitanje (bez tačnog odgovora)
  const [answers, setAnswers] = useState([]) // za pregled na rezultatima
  const [summary, setSummary] = useState(null) // { earnedXp, rawXp, capped, correctCount, total }
  const [limit, setLimit] = useState(null) // { used, limit, xpToday, xpCap, resetsAt }
  const [levelUp, setLevelUp] = useState(null)
  const [badgeQueue, setBadgeQueue] = useState([]) // novi bedževi za animaciju
  const xpAtStartRef = useRef(0)

  async function startQuiz() {
    setPhase('loading')
    track('quiz_start')
    try {
      const res = await startQuizSession()
      setLimit({
        used: res.used,
        limit: res.limit,
        xpToday: res.xpToday,
        xpCap: res.xpCap,
        resetsAt: res.resetsAt,
      })
      if (res.limited) {
        track('quiz_limit_reached', { used: res.used })
        setPhase('limited')
        return
      }
      setSession({ sessionId: res.sessionId, total: res.total })
      setQuestion(res.question)
      setAnswers([])
      setSummary(null)
      setLevelUp(null)
      setBadgeQueue([])
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
      setLimit({
        used: res.quizzesToday,
        limit: res.quizLimit,
        xpToday: res.xpToday,
        xpCap: res.xpCap,
        resetsAt: res.resetsAt,
      })
      track('quiz_complete', { score: res.summary.correctCount, total: res.summary.total, xp: res.summary.earnedXp })
      // Level-up: server vraća konačni newLevel (uključuje bonus na 10. level).
      const oldLevel = levelFromXp(xpAtStartRef.current)
      const newLevel = res.newLevel ?? levelFromXp(xpAtStartRef.current + res.summary.earnedXp)
      if (newLevel > oldLevel) {
        track('level_up', { level: newLevel })
        setLevelUp({
          level: newLevel,
          rank: rankFromLevel(newLevel),
          rankChanged: rankFromLevel(newLevel) !== rankFromLevel(oldLevel),
          bonusXp: res.levelBonus?.bonusXp || 0,
        })
      }
      // Novododijeljeni bedževi — animacija poslije level-upa (Etapa 8).
      if (res.newBadges?.length) setBadgeQueue(res.newBadges)
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
        capped={summary?.capped ? { rawXp: summary.rawXp, cap: limit?.xpCap } : null}
        quizzesToday={limit ? `${limit.used}/${limit.limit}` : null}
        levelUp={levelUp}
        onLevelUpSeen={() => setLevelUp(null)}
        badge={badgeQueue[0] || null}
        onBadgeSeen={() => setBadgeQueue((q) => q.slice(1))}
        onContinue={() => navigate('/')}
      />
    )
  }

  // Stanje limita se čita iz profila (server ga upisuje) — tako se brojač vidi
  // i prije nego se kviz uopšte pokuša pokrenuti.
  const today = dailyKey()
  const stored = profile?.quizLimit?.day === today ? profile.quizLimit : null
  const used = limit?.used ?? stored?.started ?? 0
  const maxQuizzes = limit?.limit ?? DEFAULT_LIMIT
  const xpToday = limit?.xpToday ?? stored?.xp ?? 0
  const exhausted = phase === 'limited' || used >= maxQuizzes

  if (exhausted) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center p-6 text-center">
        <span className="text-6xl">✅</span>
        <h1 className="mt-4 font-title text-3xl font-extrabold text-slate-900">
          Gotovo za danas!
        </h1>
        <p className="mt-2 text-slate-500">
          Odigrao/la si sva {maxQuizzes} dnevna kviza i osvojio/la{' '}
          <b className="text-amber-600">{xpToday} XP</b>.
          <br />
          Novi kvizovi stižu za:
        </p>
        <span className="mt-4 rounded-2xl bg-white px-6 py-3 font-mono text-2xl font-bold text-teal-800 shadow-sm">
          <ResetCountdown resetsAt={limit?.resetsAt} />
        </span>
        <p className="mt-4 max-w-xs text-sm text-slate-500">
          Preživljavanje i turnir se ne broje u ovaj limit — tamo možeš još igrati.
        </p>
        <button
          onClick={() => navigate('/questovi')}
          className="mt-8 w-full max-w-xs rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800"
        >
          Pogledaj questove →
        </button>
      </div>
    )
  }

  // Intro / loading / error
  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6 text-center">
      <span className="text-6xl">🧪</span>
      <h1 className="mt-4 font-title text-3xl font-extrabold text-slate-900">Kviz</h1>

      <span className="mt-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-bold text-teal-800">
        Danas: {used}/{maxQuizzes} kvizova · {xpToday}/{DEFAULT_XP_CAP} XP
      </span>

      {phase === 'error' ? (
        <p className="mt-2 text-slate-500">
          Ne mogu pokrenuti kviz. Provjeri internet konekciju pa pokušaj ponovo.
        </p>
      ) : (
        <p className="mt-2 text-slate-500">
          10 nasumičnih pitanja · 30 sekundi po pitanju.
          <br />
          Do {maxQuizzes} kviza dnevno, najviše {DEFAULT_XP_CAP} XP.
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

// Odbrojavanje do ponoći po BiH vremenu. Ako server nije vratio resetsAt
// (npr. limit je prepoznat iz profila), računa se lokalno — isti trenutak.
function ResetCountdown({ resetsAt }) {
  const target = resetsAt || nextDailyResetAt()
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((target - Date.now()) / 1000)))

  useEffect(() => {
    const t = setInterval(
      () => setLeft(Math.max(0, Math.floor((target - Date.now()) / 1000))),
      1000
    )
    return () => clearInterval(t)
  }, [target])

  return formatCountdown(left)
}
