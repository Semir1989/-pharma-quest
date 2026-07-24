import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getTournamentConfig, subscribeTournamentLeaderboard } from '../services/tournament'
import Avatar from '../components/Avatar'

// Vikend turnir — XP trka (Faza 2, korak B).
// Tokom prozora sav osvojeni XP (kviz/questovi/preživljavanje) se sabira ovdje.
export default function Turnir() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [cfg, setCfg] = useState(undefined) // undefined=učitava, null=nema
  const [rows, setRows] = useState([])

  useEffect(() => {
    getTournamentConfig().then(setCfg).catch(() => setCfg(null))
  }, [])

  useEffect(() => {
    if (!cfg?.key) return
    return subscribeTournamentLeaderboard(cfg.key, setRows)
  }, [cfg?.key])

  const now = Date.now()
  const state =
    !cfg || !cfg.enabled ? 'off' : now < cfg.openAt ? 'soon' : now > cfg.closeAt ? 'ended' : 'live'

  return (
    <div className="p-4">
      <button
        onClick={() => navigate('/')}
        className="mb-3 flex items-center gap-1 text-sm font-bold text-slate-500 active:text-slate-700"
      >
        ← Nazad
      </button>

      {/* Zaglavlje */}
      <div
        className="rounded-3xl p-5 text-white shadow"
        style={{ background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)' }}
      >
        <h1 className="font-title text-2xl font-extrabold">Vikend turnir</h1>
        <p className="text-sm text-teal-100">XP trka — sav XP osvojen tokom vikenda se broji</p>

        <div className="mt-4 rounded-2xl bg-white/10 p-4 text-center">
          {cfg === undefined ? (
            <p className="text-sm text-teal-100">Učitavam…</p>
          ) : state === 'live' ? (
            <>
              <p className="text-sm text-teal-100">Turnir je u toku!</p>
              <p className="mt-1 font-title text-lg font-extrabold text-amber-300">
                Završava {fmt(cfg.closeAt)}
              </p>
              <p className="mt-1 text-xs text-teal-100">Igraj kviz, questove i preživljavanje da skupiš XP</p>
            </>
          ) : state === 'soon' ? (
            <>
              <p className="text-sm text-teal-100">Sljedeći turnir počinje</p>
              <p className="mt-1 font-title text-lg font-extrabold text-amber-300">{fmt(cfg.openAt)}</p>
            </>
          ) : state === 'ended' ? (
            <>
              <p className="text-sm text-teal-100">Turnir je završen</p>
              <p className="mt-1 font-title text-lg font-extrabold text-amber-300">Rezultati ispod</p>
            </>
          ) : (
            <p className="text-sm text-teal-100">Trenutno nema aktivnog turnira</p>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <section className="mt-5">
        <h2 className="mb-2 px-1 font-title text-lg font-extrabold text-slate-900">Poredak</h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 shadow-sm">
            {state === 'live' ? 'Još niko nije osvojio XP — budi prvi!' : 'Nema rezultata.'}
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
                <span className={`w-6 text-center font-extrabold ${medal(i)}`}>{i + 1}</span>
                <Avatar id={r.avatar} size={36} />
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{r.name}</span>
                <span className="font-title font-extrabold text-amber-600">{r.xp} XP</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function medal(i) {
  if (i === 0) return 'text-amber-500'
  if (i === 1) return 'text-slate-400'
  if (i === 2) return 'text-orange-400'
  return 'text-slate-400'
}

// "ned 26.07. 18:00" u lokalnom (BiH) vremenu.
function fmt(ms) {
  if (!ms) return ''
  const opts = { timeZone: 'Europe/Sarajevo' }
  const d = new Date(ms).toLocaleDateString('bs-BA', { ...opts, weekday: 'short', day: '2-digit', month: '2-digit' })
  const t = new Date(ms).toLocaleTimeString('bs-BA', { ...opts, hour: '2-digit', minute: '2-digit' })
  return `${d} ${t}`
}
