import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getTournamentConfig,
  getXpRace,
  subscribeTournamentLeaderboard,
  subscribeTournament,
  subscribeParticipants,
  subscribeMatches,
  isRegisteredForDuel,
  countDuelParticipants,
} from '../services/tournament'
import { registerForDuel } from '../services/quizApi'
import { track } from '../services/analytics'
import Avatar from '../components/Avatar'
import Bracket from '../components/Bracket'

// Vikend turnir (Faza 2): XP trka + 1v1 duel bracket.
export default function Turnir() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [cfg, setCfg] = useState(undefined)
  const [rows, setRows] = useState([])
  const [tour, setTour] = useState(null)
  const [participants, setParticipants] = useState({})
  const [matches, setMatches] = useState([])
  const [registering, setRegistering] = useState(false)
  const [regError, setRegError] = useState('')
  const [xpRace, setXpRace] = useState(null)
  const [amRegistered, setAmRegistered] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)

  useEffect(() => {
    getTournamentConfig().then(setCfg).catch(() => setCfg(null))
  }, [])

  useEffect(() => {
    if (!cfg?.key) return
    getXpRace(cfg.key).then(setXpRace).catch(() => setXpRace(null))
  }, [cfg?.key])

  useEffect(() => {
    if (!cfg?.key) return
    const u1 = subscribeTournamentLeaderboard(cfg.key, setRows)
    const u2 = subscribeTournament(cfg.key, setTour)
    const u3 = subscribeMatches(cfg.key, setMatches)
    return () => { u1(); u2(); u3() }
  }, [cfg?.key])

  // Imena i avatari učesnika trebaju SAMO bracketu. Dok se bracket ne napravi
  // (a to je većina sedmice), kolekcija se uopšte ne čita — ranije ju je svaki
  // ulazak na /turnir povlačio cijelu.
  const bracketPostoji = matches.length > 0
  useEffect(() => {
    if (!cfg?.key || !bracketPostoji) return
    return subscribeParticipants(cfg.key, setParticipants)
  }, [cfg?.key, bracketPostoji])

  // "Jesam li prijavljen" i broj prijavljenih: jedan vlastiti dokument +
  // agregacija (getCountFromServer), umjesto cijele kolekcije učesnika.
  const osvjeziPrijavu = useCallback(async () => {
    if (!cfg?.key || !user?.uid) return
    const [prijavljen, broj] = await Promise.all([
      isRegisteredForDuel(cfg.key, user.uid),
      countDuelParticipants(cfg.key),
    ])
    setAmRegistered(prijavljen)
    setParticipantCount(broj)
  }, [cfg?.key, user?.uid])

  useEffect(() => {
    osvjeziPrijavu()
  }, [osvjeziPrijavu])

  const now = Date.now()
  const playState = !cfg || !cfg.enabled ? 'off' : now < cfg.openAt ? 'soon' : now > cfg.closeAt ? 'ended' : 'live'
  const regState = !cfg ? 'off' : now < cfg.regOpenAt ? 'soon' : now > cfg.regCloseAt ? 'closed' : 'open'
  const rewardMap = Object.fromEntries((xpRace?.top || []).map((t) => [t.uid, t.reward]))

  async function register() {
    setRegError('')
    setRegistering(true)
    try {
      await registerForDuel()
      track('tournament_register')
      await osvjeziPrijavu() // bez ovoga bi ekran ostao na "nisi prijavljen"
    } catch (e) {
      setRegError(e?.message || 'Greška pri prijavi.')
    } finally {
      setRegistering(false)
    }
  }

  // Moj meč u tekućoj rundi (ako je turnir aktivan).
  const myMatch =
    tour?.status === 'active'
      ? matches.find((m) => m.round === tour.currentRound && (m.p1 === user?.uid || m.p2 === user?.uid))
      : null
  const iPlayed = myMatch ? (myMatch.p1 === user?.uid ? myMatch.p1Played : myMatch.p2Played) : false

  return (
    <div className="p-4">
      <button
        onClick={() => navigate('/')}
        className="mb-3 flex items-center gap-1 text-sm font-bold text-slate-500 active:text-slate-700"
      >
        ← Nazad
      </button>

      {/* Zaglavlje */}
      <div className="rounded-3xl p-5 text-white shadow" style={{ background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)' }}>
        <h1 className="font-title text-2xl font-extrabold">Vikend turnir</h1>
        <p className="text-sm text-teal-100">XP trka i 1v1 dueli</p>
        <div className="mt-4 rounded-2xl bg-white/10 p-4 text-center">
          {cfg === undefined ? (
            <p className="text-sm text-teal-100">Učitavam…</p>
          ) : playState === 'live' ? (
            <p className="text-sm text-teal-100">Turnir je u toku — završava <b className="text-amber-300">{fmt(cfg.closeAt)}</b></p>
          ) : playState === 'soon' ? (
            <p className="text-sm text-teal-100">Igra počinje <b className="text-amber-300">{fmt(cfg.openAt)}</b></p>
          ) : playState === 'ended' ? (
            <p className="text-sm text-teal-100">Turnir je završen</p>
          ) : (
            <p className="text-sm text-teal-100">Trenutno nema aktivnog turnira</p>
          )}
        </div>
      </div>

      {/* Duel sekcija */}
      {cfg?.enabled && (
        <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-title text-lg font-extrabold text-slate-900">1v1 Dueli</h2>

          {/* Prijave */}
          {!tour && regState === 'soon' && (
            <p className="mt-2 text-sm text-slate-500">Prijave se otvaraju {fmt(cfg.regOpenAt)}.</p>
          )}
          {!tour && regState === 'open' && (
            amRegistered ? (
              <p className="mt-2 text-sm text-teal-700 font-semibold">
                Prijavljen ✓ · {participantCount} učesnika · bracket se pravi {fmt(cfg.regCloseAt)}
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-500">
                  Prijavi se do {fmt(cfg.regCloseAt)}. Nasumično ćeš biti uparen s protivnikom.
                </p>
                <button
                  onClick={register}
                  disabled={registering}
                  className="mt-3 w-full rounded-2xl bg-teal-700 py-3.5 font-title font-extrabold text-white active:bg-teal-800 disabled:opacity-60"
                >
                  {registering ? 'Prijavljujem…' : 'Prijavi se za duel'}
                </button>
                {regError && <p className="mt-2 text-sm text-red-600">{regError}</p>}
              </>
            )
          )}
          {!tour && regState === 'closed' && (
            <p className="mt-2 text-sm text-slate-500">Prijave su zatvorene — bracket se generiše uskoro.</p>
          )}

          {/* Otkazan */}
          {tour?.status === 'finished' && tour?.cancelled && (
            <p className="mt-2 text-sm text-slate-500">Turnir je otkazan — premalo prijava.</p>
          )}

          {/* Aktivan */}
          {tour?.status === 'active' && (
            <div className="mt-2">
              {myMatch && !iPlayed ? (
                <>
                  <p className="text-sm font-semibold text-teal-700">Tvoj duel je spreman — runda {tour.currentRound}!</p>
                  <button
                    onClick={() => navigate('/duel')}
                    className="mt-3 w-full rounded-2xl bg-teal-700 py-3.5 font-title font-extrabold text-white active:bg-teal-800"
                  >
                    Igraj svoj duel
                  </button>
                </>
              ) : myMatch && iPlayed ? (
                <p className="text-sm text-slate-500">
                  Odigrao si duel. Rezultat protivnika je skriven — runda se zatvara {fmt(tour.roundDeadlines?.[tour.currentRound - 1])}.
                </p>
              ) : amRegistered ? (
                <p className="text-sm text-slate-500">Ispao si iz turnira. Prati bracket ispod.</p>
              ) : (
                <p className="text-sm text-slate-500">Nisi u ovom turniru. Prati bracket ispod.</p>
              )}
            </div>
          )}

          {/* Pobjednik */}
          {tour?.status === 'finished' && !tour?.cancelled && tour?.winnerUid && (
            <p className="mt-2 text-sm font-semibold text-teal-700">
              {tour.winnerUid === user?.uid ? '🏆 Ti si šampion turnira!' : `Šampion: ${participants[tour.winnerUid]?.name || '—'}`}
            </p>
          )}

          {/* Bracket */}
          {matches.length > 0 && (
            <div className="mt-4">
              <Bracket matches={matches} participants={participants} myUid={user?.uid} />
            </div>
          )}
        </section>
      )}

      {/* XP trka leaderboard */}
      <section className="mt-5">
        <h2 className="mb-2 px-1 font-title text-lg font-extrabold text-slate-900">
          XP trka — poredak
          {xpRace?.finalized && <span className="ml-2 text-sm font-medium text-teal-600">· nagrade dodijeljene</span>}
        </h2>
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 shadow-sm">
            {playState === 'live' ? 'Još niko nije osvojio XP — budi prvi!' : 'Nema rezultata.'}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const reward = rewardMap[r.uid]
              return (
                <div
                  key={r.uid}
                  className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ${r.uid === user?.uid ? 'ring-2 ring-teal-500' : ''}`}
                >
                  <span className={`w-6 text-center font-extrabold ${medal(i)}`}>{i + 1}</span>
                  <Avatar id={r.avatar} size={36} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{r.name}</span>
                  {reward > 0 && (
                    <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600">+{reward}</span>
                  )}
                  <span className="font-title font-extrabold text-amber-600">{r.xp} XP</span>
                </div>
              )
            })}
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

// "26.07. u 18:00" — evropski format, 24h, BiH vrijeme (bez oslanjanja na locale).
function fmt(ms) {
  if (!ms) return ''
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
