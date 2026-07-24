import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { startSurvival, submitSurvivalAnswer } from '../services/quizApi'
import { subscribeSurvivalLeaderboard } from '../services/survival'
import { secondsUntilSurvivalReset, formatCountdown } from '../utils/periods'
import { levelFromXp, rankFromLevel } from '../utils/levels'
import SurvivalQuestion from '../components/SurvivalQuestion'
import LevelUpOverlay from '../components/LevelUpOverlay'
import BadgeUnlockOverlay from '../components/BadgeUnlockOverlay'
import Avatar from '../components/Avatar'

// Preživljavanje (Etapa 8): endless mod, jedan pokušaj sedmično (reset srijedom).
// Za svaki tačan +3 XP; kraj na prvu grešku ili istek tajmera.
export default function Prezivljavanje() {
  const { profile, user } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('intro') // intro | loading | locked | playing | ended | error
  const [question, setQuestion] = useState(null)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0) // za locked/ended prikaz
  const [rows, setRows] = useState([])
  const [levelUp, setLevelUp] = useState(null)
  const [badgeQueue, setBadgeQueue] = useState([])
  const xpAtStartRef = useRef(0)
  const badgesRef = useRef([]) // skupljeni novi bedževi tokom run-a

  // Live leaderboard tekuće sedmice.
  useEffect(() => subscribeSurvivalLeaderboard(setRows), [])

  async function begin() {
    setPhase('loading')
    badgesRef.current = []
    xpAtStartRef.current = profile?.xp || 0
    try {
      const res = await startSurvival()
      if (res.locked) {
        setBestStreak(res.streak || 0)
        setPhase('locked')
        return
      }
      setStreak(res.streak || 0)
      setQuestion(res.question)
      setPhase('playing')
    } catch {
      setPhase('error')
    }
  }

  async function handleSubmit(selected) {
    const res = await submitSurvivalAnswer(selected)
    setStreak(res.streak)
    if (res.newBadges?.length) badgesRef.current.push(...res.newBadges)
    return res
  }

  function handleNext(feedback) {
    if (feedback.finished) {
      setBestStreak(feedback.streak)
      // Kraj run-a → prvo level-up (ako ga je bilo), pa bedževi, pa ekran kraja.
      const oldLevel = levelFromXp(xpAtStartRef.current)
      const newLevel = levelFromXp(profile?.xp || 0)
      if (newLevel > oldLevel) {
        setLevelUp({
          level: newLevel,
          rank: rankFromLevel(newLevel),
          rankChanged: rankFromLevel(newLevel) !== rankFromLevel(oldLevel),
        })
      }
      if (badgesRef.current.length) setBadgeQueue(badgesRef.current)
      setPhase('ended')
    } else {
      setQuestion(feedback.question)
    }
  }

  // Animacije imaju prednost nad sadržajem (redoslijed: level → bedž → ekran).
  if (levelUp) {
    return (
      <LevelUpOverlay
        level={levelUp.level}
        rank={levelUp.rank}
        rankChanged={levelUp.rankChanged}
        onClose={() => setLevelUp(null)}
      />
    )
  }
  if (badgeQueue.length > 0) {
    return (
      <BadgeUnlockOverlay
        badge={badgeQueue[0]}
        onClose={() => setBadgeQueue((q) => q.slice(1))}
      />
    )
  }

  if (phase === 'playing' && question) {
    return (
      <SurvivalQuestion
        key={question.id}
        question={question}
        streak={streak}
        onSubmit={handleSubmit}
        onNext={handleNext}
      />
    )
  }

  return (
    <div className="p-4">
      {/* Zaglavlje */}
      <div
        className="rounded-3xl p-5 text-white shadow"
        style={{ background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-4xl">💀</span>
          <div>
            <h1 className="font-title text-2xl font-extrabold">Preživljavanje</h1>
            <p className="text-sm text-slate-300">Sedmični izazov — koliko dugo možeš?</p>
          </div>
        </div>

        {phase === 'ended' && (
          <div className="mt-4 rounded-2xl bg-white/10 p-4 text-center">
            <p className="text-sm text-slate-300">Tvoj niz ove sedmice</p>
            <p className="font-title text-5xl font-extrabold text-amber-300">{bestStreak}</p>
            <p className="mt-1 text-sm text-slate-300">+{bestStreak * 3} XP osvojeno · vrati se u srijedu</p>
          </div>
        )}

        {phase === 'locked' && (
          <div className="mt-4 rounded-2xl bg-white/10 p-4 text-center">
            <p className="text-sm text-slate-300">Pokušaj za ovu sedmicu iskorišten</p>
            <p className="font-title text-4xl font-extrabold text-amber-300">Niz: {bestStreak}</p>
            <p className="mt-1 text-sm text-slate-300">
              Novi pokušaj za {formatCountdown(secondsUntilSurvivalReset())}
            </p>
          </div>
        )}
      </div>

      {/* Pravila + dugme (intro/error) */}
      {(phase === 'intro' || phase === 'loading' || phase === 'error') && (
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <ul className="flex flex-col gap-2 text-sm text-slate-600">
            <li>🎯 Odgovaraj tačno — svaki tačan odgovor je <b>+3 XP</b> i produžava niz.</li>
            <li>💥 Prva greška (ili istek 20s) završava izazov za ovu sedmicu.</li>
            <li>🔁 Jedan pokušaj sedmično — resetuje se srijedom.</li>
          </ul>
          {phase === 'error' && (
            <p className="mt-3 text-sm font-medium text-red-600">
              Ne mogu pokrenuti izazov. Provjeri konekciju pa pokušaj ponovo.
            </p>
          )}
          <button
            onClick={begin}
            disabled={phase === 'loading'}
            className="mt-4 w-full rounded-2xl bg-slate-900 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-black disabled:opacity-60"
          >
            {phase === 'loading' ? 'Pokrećem…' : phase === 'error' ? 'Pokušaj ponovo' : '💀 Započni izazov'}
          </button>
        </div>
      )}

      {phase === 'ended' && (
        <button
          onClick={() => navigate('/')}
          className="mt-4 w-full rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800"
        >
          Nastavi →
        </button>
      )}

      {/* Leaderboard sedmice */}
      <section className="mt-5">
        <h2 className="mb-2 px-1 font-title text-lg font-extrabold text-slate-900">
          🏆 Najduži nizovi ove sedmice
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 shadow-sm">
            Još niko nije igrao ove sedmice — budi prvi!
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <div
                key={r.uid}
                className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ${
                  r.uid === user?.uid ? 'ring-2 ring-teal-500' : ''
                }`}
              >
                <span className="w-6 text-center font-bold text-slate-400">{i + 1}</span>
                <Avatar id={r.avatar} size={36} />
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{r.name}</span>
                <span className="font-title font-extrabold text-slate-900">💀 {r.streak}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
