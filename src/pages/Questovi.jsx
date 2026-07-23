import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTasks, progressForType, taskValue, claimTask } from '../services/tasks'
import { levelFromXp, rankFromLevel } from '../utils/levels'
import LevelUpOverlay from '../components/LevelUpOverlay'
import {
  secondsUntilMidnight,
  formatCountdown,
  daysUntilWeekEnd,
  daysUntilMonthEnd,
} from '../utils/periods'
import CircleProgress from '../components/CircleProgress'

// Questovi ekran (Modul 6): dnevni / sedmični / mjesečni taskovi
// s kružnim progresom i "Preuzmi" dugmetom za nagrade.
export default function Questovi() {
  const { profile } = useAuth()
  const [tasks, setTasks] = useState(null) // { daily, weekly, monthly }
  const [claiming, setClaiming] = useState(null) // id taska čija se nagrada upisuje
  const [levelUp, setLevelUp] = useState(null) // { level, rank, rankChanged } ili null

  useEffect(() => {
    getTasks().then(setTasks).catch(() => setTasks({ daily: [], weekly: [], monthly: [] }))
  }, [])

  if (!profile) return null

  async function handleClaim(task) {
    if (claiming) return
    setClaiming(task.id)
    try {
      const xpBefore = profile.xp || 0
      const reward = await claimTask(task)
      // Profil se osvježava sam (live listener) — claimed i XP stižu odmah.
      // Level-up animacija i ovdje, ne samo poslije kviza (Modul 5).
      const oldLevel = levelFromXp(xpBefore)
      const newLevel = levelFromXp(xpBefore + reward)
      if (newLevel > oldLevel) {
        setLevelUp({
          level: newLevel,
          rank: rankFromLevel(newLevel),
          rankChanged: rankFromLevel(newLevel) !== rankFromLevel(oldLevel),
        })
      }
    } finally {
      setClaiming(null)
    }
  }

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

  return (
    <div className="p-4">
      {/* Naslov + level */}
      <div className="flex items-center justify-between">
        <h1 className="font-title text-3xl font-extrabold text-slate-900">Questovi</h1>
        <span className="flex items-center gap-1 rounded-xl bg-white px-3 py-1 text-sm font-bold text-teal-800 shadow-sm">
          ⭐ Lvl {levelFromXp(profile.xp)}
        </span>
      </div>

      {tasks === null ? (
        <p className="mt-8 text-center text-slate-400">Učitavam taskove…</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <DailySection tasks={tasks.daily} profile={profile} claiming={claiming} onClaim={handleClaim} />
          <PeriodSection
            title="Sedmični"
            icon="📅"
            renewText={`Obnavlja se za ${daysUntilWeekEnd()} ${daysUntilWeekEnd() === 1 ? 'dan' : 'dana'}`}
            type="weekly"
            color="#0f766e"
            bgClass="bg-teal-50"
            tasks={tasks.weekly}
            profile={profile}
            claiming={claiming}
            onClaim={handleClaim}
          />
          <PeriodSection
            title="Mjesečni"
            icon="🗓️"
            renewText={`Obnavlja se za ${daysUntilMonthEnd()} ${daysUntilMonthEnd() === 1 ? 'dan' : 'dana'}`}
            type="monthly"
            color="#d97706"
            bgClass="bg-amber-50"
            tasks={tasks.monthly}
            profile={profile}
            claiming={claiming}
            onClaim={handleClaim}
          />
        </div>
      )}
    </div>
  )
}

// Dnevna sekcija — tamna kartica s odbrojavanjem do ponoći.
function DailySection({ tasks, profile, claiming, onClaim }) {
  const [seconds, setSeconds] = useState(secondsUntilMidnight())

  useEffect(() => {
    const t = setInterval(() => setSeconds(secondsUntilMidnight()), 1000)
    return () => clearInterval(t)
  }, [])

  const progress = progressForType(profile, 'daily')

  return (
    <section
      className="rounded-3xl p-4 shadow"
      style={{ background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)' }}
    >
      <div className="flex items-center justify-between text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xl">📅</span>
          <div>
            <h2 className="font-title text-xl font-extrabold">Dnevni</h2>
            <p className="text-xs text-teal-100">Novi zadaci za</p>
          </div>
        </div>
        <span className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 font-mono text-sm font-bold">
          🕐 {formatCountdown(seconds)}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            progress={progress}
            color="#0f766e"
            claiming={claiming}
            onClaim={onClaim}
          />
        ))}
      </div>
    </section>
  )
}

// Sedmična / mjesečna sekcija — svijetla kartica.
function PeriodSection({ title, icon, renewText, type, color, bgClass, tasks, profile, claiming, onClaim }) {
  const progress = progressForType(profile, type)

  return (
    <section className={`rounded-3xl ${bgClass} p-4`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-sm">{icon}</span>
        <div>
          <h2 className="font-title text-xl font-extrabold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{renewText}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            progress={progress}
            color={color}
            claiming={claiming}
            onClaim={onClaim}
          />
        ))}
      </div>
    </section>
  )
}

// Jedan red taska: kružić, naziv, XP oznaka ili Preuzmi/Preuzeto.
function TaskRow({ task, progress, color, claiming, onClaim }) {
  const value = taskValue(progress, task)
  const done = value >= task.goal
  const claimed = !!progress.claimed[task.id]

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
      <CircleProgress value={value} goal={task.goal} color={color} done={done} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-slate-800">{task.title}</p>
        {done && !claimed && <p className="text-sm font-bold text-green-600">Završeno!</p>}
        {claimed && <p className="text-sm text-slate-400">Nagrada preuzeta ✓</p>}
      </div>
      {done && !claimed ? (
        <button
          onClick={() => onClaim(task)}
          disabled={claiming !== null}
          className="rounded-xl bg-amber-500 px-4 py-2 font-title font-extrabold text-white shadow active:bg-amber-600 disabled:opacity-60"
        >
          {claiming === task.id ? '…' : '⭐ Preuzmi'}
        </button>
      ) : (
        <span className={`rounded-xl border px-3 py-1 text-sm font-bold ${claimed ? 'border-slate-200 text-slate-300' : 'border-amber-300 bg-amber-50 text-amber-600'}`}>
          +{task.reward} XP
        </span>
      )}
    </div>
  )
}
