import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { subscribeLeaderboard } from '../services/leaderboard'
import Avatar from '../components/Avatar'

// Leaderboard ekran (Modul 7): globalni i sedmični, uživo iz Realtime DB.
// Top 3 na podiju, ostali u listi; klik na igrača vodi na javni profil.
export default function Leaderboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('global') // 'global' | 'weekly'
  const [rows, setRows] = useState(null)

  useEffect(() => {
    setRows(null)
    const unsubscribe = subscribeLeaderboard(tab, setRows)
    return unsubscribe
  }, [tab])

  const openProfile = (uid) => navigate(`/igrac/${uid}`)

  return (
    <div className="p-4">
      {/* Naslov + UŽIVO */}
      <div className="flex items-center justify-between">
        <h1 className="font-title text-3xl font-extrabold text-slate-900">Leaderboard</h1>
        <span className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          UŽIVO
        </span>
      </div>

      {/* Tabovi */}
      <div className="mt-4 flex gap-2">
        <Tab active={tab === 'global'} onClick={() => setTab('global')}>Globalni</Tab>
        <Tab active={tab === 'weekly'} onClick={() => setTab('weekly')}>Sedmični</Tab>
        <Tab disabled>Klanovi</Tab>
      </div>

      {rows === null ? (
        <p className="mt-10 text-center text-slate-400">Učitavam rezultate…</p>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-center text-slate-400">
          Još nema rezultata{tab === 'weekly' ? ' ove sedmice' : ''} — odigraj kviz i budi prvi! 🏆
        </p>
      ) : (
        <>
          <Podium rows={rows.slice(0, 3)} myUid={user.uid} onOpen={openProfile} />
          <div className="mt-4 flex flex-col gap-2">
            {rows.slice(3).map((row, i) => (
              <Row
                key={row.uid}
                position={i + 4}
                row={row}
                isMe={row.uid === user.uid}
                onClick={() => openProfile(row.uid)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Tab({ active, disabled, onClick, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
        active
          ? 'bg-teal-700 text-white shadow'
          : disabled
            ? 'border border-slate-200 bg-white text-slate-300'
            : 'border border-slate-200 bg-white text-slate-600'
      }`}
    >
      {children}
      {disabled && <span className="ml-1 text-[10px]">(uskoro)</span>}
    </button>
  )
}

// Podij za top 3: srebro (2) — zlato (1) — bronza (3).
const MEDALS = [
  { ring: 'ring-amber-400', badge: '👑', height: 'h-24', bg: 'bg-teal-700' },
  { ring: 'ring-slate-300', badge: '2', height: 'h-16', bg: 'bg-teal-600' },
  { ring: 'ring-amber-600', badge: '3', height: 'h-12', bg: 'bg-teal-600' },
]

function Podium({ rows, myUid, onOpen }) {
  // Raspored kolona: [2., 1., 3.]
  const order = [rows[1], rows[0], rows[2]].filter(Boolean)

  return (
    <div className="mt-6 flex items-end justify-center gap-3">
      {order.map((row) => {
        const rank = rows.indexOf(row) // 0 = prvi
        const m = MEDALS[rank]
        return (
          <button
            key={row.uid}
            onClick={() => onOpen(row.uid)}
            className="flex w-24 flex-col items-center"
          >
            {rank === 0 && <span className="text-2xl">👑</span>}
            <div className={`rounded-full ring-4 ${m.ring}`}>
              <Avatar id={row.avatar} size={rank === 0 ? 72 : 56} />
            </div>
            <span className={`mt-1 max-w-full truncate font-bold text-slate-800 ${myUid === row.uid ? 'text-teal-700' : ''}`}>
              {row.name}
            </span>
            <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-600">
              Lvl {row.level}
            </span>
            <span className="mt-0.5 text-sm font-bold text-amber-600">{row.xp} XP</span>
            <div className={`mt-2 flex w-full items-start justify-center rounded-t-xl ${m.bg} ${m.height} pt-2 font-title text-2xl font-extrabold text-white`}>
              {rank + 1}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function Row({ position, row, isMe, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left shadow-sm ${
        isMe ? 'bg-teal-50 ring-2 ring-teal-600' : 'bg-white'
      }`}
    >
      <div className="flex w-8 flex-col items-center">
        <span className="font-title text-xl font-extrabold text-slate-700">{position}</span>
        {isMe && <span className="text-[10px] font-bold text-teal-700">● Ti</span>}
      </div>
      <Avatar id={row.avatar} size={44} />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-bold ${isMe ? 'text-teal-800' : 'text-slate-800'}`}>{row.name}</p>
        <span className="inline-block rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-500">
          Lvl {row.level}
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-bold text-slate-800">{row.xp} XP</span>
        <span className="text-sm text-orange-500">🔥 {row.streak || 0}</span>
      </div>
    </button>
  )
}
