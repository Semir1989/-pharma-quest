import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import { levelFromXp, xpProgress } from '../utils/levels'

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

      {/* Placeholder za dnevni zadatak / leaderboard (dolazi u sljedećim modulima) */}
      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
        Kartica dnevnog zadatka, sedmični zadatak i leaderboard dolaze u
        sljedećim modulima.
      </div>
    </div>
  )
}
