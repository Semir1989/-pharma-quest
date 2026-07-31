import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from '../components/Avatar'
import {
  getXpRaceConfig,
  getXpTrkaRezultat,
  subscribeXpTrka,
  xpTrkaFaza,
} from '../services/xpTrka'
import { formatCountdownLong } from '../utils/periods'
import { useNow } from '../utils/useNow'

// XP TRKA — vlastita stranica eventa.
//
// Ranije je klik na karticu trke vodio na /turnir, gdje je ljestvica stajala
// ispod duel bracketa: dva različita takmičenja na jednom ekranu, pa se nije
// vidjelo ni ko vodi ni koliko fali do sljedećeg. Ovdje trka ima cijeli ekran:
// podij, moja pozicija i razmak do onoga ispred.
//
// Broji se sav XP osvojen OD POČETKA eventa — kviz, questovi, Preživljavanje,
// dueli. Sabira ga server; klijent samo čita.

const NAGRADE = [500, 300, 150] // 1., 2., 3. mjesto

export default function XpTrka() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const now = useNow()
  const [cfg, setCfg] = useState(undefined)
  const [rows, setRows] = useState(null)
  const [rezultat, setRezultat] = useState(null)

  useEffect(() => {
    getXpRaceConfig()
      .then(setCfg)
      .catch(() => setCfg(null))
  }, [])

  useEffect(() => {
    if (!cfg?.key) return
    getXpTrkaRezultat(cfg.key)
      .then(setRezultat)
      .catch(() => setRezultat(null))
    return subscribeXpTrka(cfg.key, setRows)
  }, [cfg?.key])

  const faza = xpTrkaFaza(cfg, now)
  const nagradaPo = useMemo(
    () => Object.fromEntries((rezultat?.top || []).map((t) => [t.uid, t.reward])),
    [rezultat]
  )

  const mojIndeks = rows ? rows.findIndex((r) => r.uid === user?.uid) : -1
  const ja = mojIndeks >= 0 ? rows[mojIndeks] : null
  const ispredMene = mojIndeks > 0 ? rows[mojIndeks - 1] : null
  const zaostatak = ja && ispredMene ? (ispredMene.xp || 0) - (ja.xp || 0) : 0
  const ukupnoXp = rows ? rows.reduce((s, r) => s + (r.xp || 0), 0) : 0

  return (
    <div className="p-4">
      <button
        onClick={() => navigate('/arena')}
        className="mb-3 flex items-center gap-1 text-sm font-bold text-slate-500 active:text-slate-700"
      >
        ← Arena
      </button>

      {/* Zaglavlje — zlatno, kao i kartica trke u Areni */}
      <div
        className="rounded-3xl p-5 text-white shadow"
        style={{ background: 'linear-gradient(180deg, #b45309 0%, #78350f 100%)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-title text-2xl font-extrabold">XP trka</h1>
            <p className="text-sm text-amber-100">Ko skupi najviše XP-a dok event traje</p>
          </div>
          {faza === 'live' && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-2.5 py-1 text-[11px] font-bold">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              UŽIVO
            </span>
          )}
        </div>

        <div className="mt-4 rounded-2xl bg-white/10 p-3 text-center">
          {cfg === undefined ? (
            <p className="text-sm text-amber-100">Učitavam…</p>
          ) : faza === 'live' ? (
            <>
              <p className="text-xs font-semibold text-amber-100">Trka završava za</p>
              <p className="font-title text-2xl font-extrabold tabular-nums">
                {formatCountdownLong((cfg.closeAt - now) / 1000)}
              </p>
            </>
          ) : faza === 'pre' ? (
            <>
              <p className="text-xs font-semibold text-amber-100">Trka počinje za</p>
              <p className="font-title text-2xl font-extrabold tabular-nums">
                {formatCountdownLong((cfg.openAt - now) / 1000)}
              </p>
            </>
          ) : faza === 'ended' ? (
            <p className="text-sm font-semibold">
              Trka je završena{rezultat?.finalized ? ' — nagrade su isplaćene' : ' — nagrade se obračunavaju'}
            </p>
          ) : (
            <p className="text-sm text-amber-100">Trenutno nema aktivne trke</p>
          )}
        </div>

        {faza !== 'off' && (
          <p className="mt-2 text-center text-[11px] text-amber-200">
            Broji se od {fmt(cfg?.openAt)} · {rows?.length ?? 0}{' '}
            {rows?.length === 1 ? 'učesnik' : 'učesnika'} · {ukupnoXp.toLocaleString('bs-BA')} XP ukupno
          </p>
        )}
      </div>

      {/* Moja pozicija — prvo što igrač traži kad otvori trku */}
      {ja && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-2 ring-amber-500">
          <div className="flex w-10 flex-col items-center">
            <span className="font-title text-2xl font-extrabold text-amber-600">{mojIndeks + 1}.</span>
            <span className="text-[10px] font-bold text-slate-400">mjesto</span>
          </div>
          <Avatar id={ja.avatar} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-slate-800">{ja.name}</p>
            <p className="text-xs text-slate-500">
              {mojIndeks === 0
                ? 'Vodiš u trci 👑'
                : `${zaostatak.toLocaleString('bs-BA')} XP do ${ispredMene.name}`}
            </p>
          </div>
          <span className="font-title text-xl font-extrabold text-amber-600">
            {(ja.xp || 0).toLocaleString('bs-BA')}
          </span>
        </div>
      )}

      {/* Nagrade */}
      {faza !== 'off' && (
        <div className="mt-3 flex gap-2">
          {NAGRADE.map((n, i) => (
            <div
              key={i}
              className="flex-1 rounded-xl border border-amber-200 bg-amber-50 px-2 py-2 text-center"
            >
              <p className="text-[11px] font-bold text-amber-700">{['🥇', '🥈', '🥉'][i]} {i + 1}. mjesto</p>
              <p className="font-title text-sm font-extrabold text-amber-600">+{n} XP</p>
            </div>
          ))}
        </div>
      )}

      {/* Poredak */}
      <h2 className="mt-5 px-1 font-title text-lg font-extrabold text-slate-900">Poredak</h2>

      {rows === null ? (
        <p className="mt-8 text-center text-slate-400">Učitavam poredak…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm">
          {faza === 'live'
            ? 'Još niko nije osvojio XP — odigraj kviz i budi prvi! 🏆'
            : 'Nema rezultata za ovaj event.'}
        </p>
      ) : (
        <>
          <Podij rows={rows.slice(0, 3)} myUid={user?.uid} onOpen={(uid) => navigate(`/igrac/${uid}`)} />
          <div className="mt-4 flex flex-col gap-2">
            {rows.slice(3).map((r, i) => (
              <Red
                key={r.uid}
                mjesto={i + 4}
                row={r}
                isMe={r.uid === user?.uid}
                nagrada={nagradaPo[r.uid]}
                onClick={() => navigate(`/igrac/${r.uid}`)}
              />
            ))}
          </div>
        </>
      )}

      <p className="mt-5 px-1 text-center text-xs text-slate-400">
        Broji se sav XP osvojen tokom eventa: kviz, questovi, Preživljavanje i dueli.
        Igrači skriveni s ljestvica se ne prikazuju.
      </p>
    </div>
  )
}

const PODIJ = [
  { prsten: 'ring-amber-400', visina: 'h-24', bg: 'bg-amber-500' },
  { prsten: 'ring-slate-300', visina: 'h-16', bg: 'bg-amber-400' },
  { prsten: 'ring-amber-700', visina: 'h-12', bg: 'bg-amber-400' },
]

function Podij({ rows, myUid, onOpen }) {
  const redoslijed = [rows[1], rows[0], rows[2]].filter(Boolean) // 2. — 1. — 3.
  return (
    <div className="mt-4 flex items-end justify-center gap-3">
      {redoslijed.map((row) => {
        const rang = rows.indexOf(row)
        const m = PODIJ[rang]
        return (
          <button key={row.uid} onClick={() => onOpen(row.uid)} className="flex w-24 flex-col items-center">
            {rang === 0 && <span className="text-2xl">👑</span>}
            <div className={`rounded-full ring-4 ${m.prsten}`}>
              <Avatar id={row.avatar} size={rang === 0 ? 72 : 56} />
            </div>
            <span
              className={`mt-1 max-w-full truncate font-bold ${
                myUid === row.uid ? 'text-amber-600' : 'text-slate-800'
              }`}
            >
              {row.name}
            </span>
            <span className="mt-0.5 text-sm font-bold text-amber-600">
              {(row.xp || 0).toLocaleString('bs-BA')} XP
            </span>
            <div
              className={`mt-2 flex w-full items-start justify-center rounded-t-xl ${m.bg} ${m.visina} pt-2 font-title text-2xl font-extrabold text-white`}
            >
              {rang + 1}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function Red({ mjesto, row, isMe, nagrada, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left shadow-sm ${
        isMe ? 'bg-amber-50 ring-2 ring-amber-500' : 'bg-white'
      }`}
    >
      <div className="flex w-8 flex-col items-center">
        <span className="font-title text-xl font-extrabold text-slate-700">{mjesto}</span>
        {isMe && <span className="text-[10px] font-bold text-amber-600">● Ti</span>}
      </div>
      <Avatar id={row.avatar} size={44} />
      <p className={`min-w-0 flex-1 truncate font-bold ${isMe ? 'text-amber-800' : 'text-slate-800'}`}>
        {row.name}
      </p>
      {nagrada > 0 && (
        <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
          +{nagrada}
        </span>
      )}
      <span className="font-title font-extrabold text-amber-600">
        {(row.xp || 0).toLocaleString('bs-BA')}
      </span>
    </button>
  )
}

// "31.07. u 18:00" — BiH vrijeme, bez oslanjanja na locale pregledača.
function fmt(ms) {
  if (!ms) return '—'
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Sarajevo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  )
  return `${p.day}.${p.month}. u ${p.hour}:${p.minute}`
}
