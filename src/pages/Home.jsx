import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import CircleProgress from '../components/CircleProgress'
import { levelFromXp, xpProgress } from '../utils/levels'
import { getTasks, progressForType, taskValue } from '../services/tasks'

function greeting() {
  const h = new Date().getHours()
  if (h < 11) return 'Dobro jutro'
  if (h < 18) return 'Dobar dan'
  return 'Dobro veče'
}

export default function Home() {
  const { profile } = useAuth()
  if (!profile) return null

  const level = levelFromXp(profile.xp)
  const prog = xpProgress(profile.xp)

  return (
    <div className="p-4">
      {/* Gornji red: avatar, level, streak */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar id={profile.avatar} size={52} className="ring-2 ring-teal-500" />
          <span className="flex items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-bold text-teal-800">
            ⭐ Lvl {level}
          </span>
        </div>
        <span className="flex items-center gap-1 rounded-xl bg-white px-3 py-1 text-sm font-bold text-orange-500 shadow-sm">
          🔥 {profile.streak || 0}
        </span>
      </div>

      {/* Pozdrav + XP bar */}
      <h1 className="mt-5 font-title text-3xl font-extrabold text-slate-900">
        {greeting()}, {profile.displayName}!
      </h1>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-3 flex-1 rounded-full bg-slate-200">
          <div
            className="h-3 rounded-full bg-amber-400"
            style={{ width: `${prog.percent}%` }}
          />
        </div>
        <span className="text-sm font-bold text-amber-600">
          {prog.current}/{prog.needed} XP
        </span>
      </div>

      {/* Dnevni taskovi — kružići napretka (Modul 6) */}
      <DailyTasksCard profile={profile} />

      {/* Leaderboard kartica (Modul 7) */}
      <Link
        to="/leaderboard"
        className="mt-4 flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-xl">🏆</span>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Leaderboard</h2>
            <p className="text-xs text-slate-500">Globalni i sedmični poredak — uživo</p>
          </div>
        </div>
        <span className="text-sm font-bold text-teal-700">Pogledaj →</span>
      </Link>
    </div>
  )
}

// Kartica dnevnih taskova s kružnim progresom — klik vodi na Questove.
function DailyTasksCard({ profile }) {
  const [daily, setDaily] = useState(null)

  useEffect(() => {
    getTasks().then((t) => setDaily(t.daily)).catch(() => setDaily([]))
  }, [])

  if (!daily || daily.length === 0) return null

  const progress = progressForType(profile, 'daily')
  const allDone = daily.every((t) => taskValue(progress, t) >= t.goal)

  return (
    <Link
      to="/questovi"
      className="mt-6 block rounded-2xl bg-white p-4 shadow-sm active:bg-slate-50"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">📅 Dnevni zadaci</h2>
        <span className={`text-sm font-bold ${allDone ? 'text-green-600' : 'text-teal-700'}`}>
          {allDone ? 'Sve završeno! ✓' : 'Pogledaj →'}
        </span>
      </div>
      <div className="mt-3 flex justify-around">
        {daily.map((task) => {
          const value = taskValue(progress, task)
          return (
            <div key={task.id} className="flex w-24 flex-col items-center text-center">
              <CircleProgress value={value} goal={task.goal} done={value >= task.goal} size={48} />
              <span className="mt-1 text-[11px] leading-tight text-slate-500">{task.shortTitle || task.title}</span>
            </div>
          )
        })}
      </div>
    </Link>
  )
}
