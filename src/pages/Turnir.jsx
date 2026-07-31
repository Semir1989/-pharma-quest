import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getTournamentConfig,
  subscribeTournament,
  subscribeParticipants,
  subscribeMatches,
  isRegisteredForDuel,
  countDuelParticipants,
} from '../services/tournament'
import { registerForDuel } from '../services/quizApi'
import { track } from '../services/analytics'
import { formatCountdownLong } from '../utils/periods'
import { useNow } from '../utils/useNow'
import Bracket from '../components/Bracket'

// 1v1 ARENA — samo dueli.
//
// XP trka je odvojena u vlastiti event (/xp-trka). Ranije su dijelile ovaj
// ekran, pa je ispod bracketa stajala ljestvica koja s duelima nema veze i
// gurala je stablo turnira uvis.
export default function Turnir() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const now = useNow()
  const [cfg, setCfg] = useState(undefined)
  const [tour, setTour] = useState(null)
  const [participants, setParticipants] = useState({})
  const [matches, setMatches] = useState([])
  const [registering, setRegistering] = useState(false)
  const [regError, setRegError] = useState('')
  const [amRegistered, setAmRegistered] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)

  useEffect(() => {
    getTournamentConfig().then(setCfg).catch(() => setCfg(null))
  }, [])

  useEffect(() => {
    if (!cfg?.key) return
    const u1 = subscribeTournament(cfg.key, setTour)
    const u2 = subscribeMatches(cfg.key, setMatches)
    return () => { u1(); u2() }
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

  // Kraj turnira je rok POSLJEDNJE runde, a ne closeAt iz configa: raspored
  // rundi ide po BiH terminima i ne mora se poklopiti s prozorom eventa.
  const kraj = tour?.roundDeadlines?.[(tour?.rounds || 1) - 1] || cfg?.closeAt
  const playState =
    !cfg || !cfg.enabled ? 'off' : now < cfg.openAt ? 'soon' : now > (kraj || 0) ? 'ended' : 'live'
  const regState = !cfg ? 'off' : now < cfg.regOpenAt ? 'soon' : now > cfg.regCloseAt ? 'closed' : 'open'

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
  const protivnik = myMatch
    ? participants[myMatch.p1 === user?.uid ? myMatch.p2 : myMatch.p1]?.name
    : null
  const rokRunde = tour?.roundDeadlines?.[(tour?.currentRound || 1) - 1]

  return (
    <div className="p-4">
      <button
        onClick={() => navigate('/arena')}
        className="mb-3 flex items-center gap-1 text-sm font-bold text-slate-500 active:text-slate-700"
      >
        ← Arena
      </button>

      {/* Zaglavlje */}
      <div className="rounded-3xl p-5 text-white shadow" style={{ background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-title text-2xl font-extrabold">⚔️ 1v1 Arena</h1>
            <p className="text-sm text-teal-100">Turnir na ispadanje, 10 pitanja po duelu</p>
          </div>
          {tour?.status === 'active' && (
            <span className="shrink-0 rounded-xl bg-white/15 px-2.5 py-1 text-[11px] font-bold">
              Runda {tour.currentRound}/{tour.rounds}
            </span>
          )}
        </div>

        <div className="mt-4 rounded-2xl bg-white/10 p-4 text-center">
          {cfg === undefined ? (
            <p className="text-sm text-teal-100">Učitavam…</p>
          ) : playState === 'live' && tour?.status === 'active' && rokRunde ? (
            <>
              <p className="text-xs font-semibold text-teal-100">Runda {tour.currentRound} se zatvara za</p>
              <p className="font-title text-2xl font-extrabold tabular-nums">
                {formatCountdownLong((rokRunde - now) / 1000)}
              </p>
              <p className="mt-1 text-[11px] text-teal-200">{dugo(rokRunde)}</p>
            </>
          ) : playState === 'live' ? (
            <p className="text-sm text-teal-100">
              Turnir je u toku — parovi se izvlače uskoro
            </p>
          ) : playState === 'soon' ? (
            <p className="text-sm text-teal-100">
              Borbe počinju <b className="text-amber-300">{dugo(cfg.openAt)}</b>
            </p>
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
          {/* Prijave */}
          {!tour && regState === 'soon' && (
            <p className="text-sm text-slate-500">Prijave se otvaraju {dugo(cfg.regOpenAt)}.</p>
          )}
          {!tour && regState === 'open' && (
            amRegistered ? (
              <p className="text-sm font-semibold text-teal-700">
                Prijavljen ✓ · {participantCount} učesnika · parovi se izvlače {dugo(cfg.regCloseAt)}
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-500">
                  Prijavi se do {dugo(cfg.regCloseAt)}. Nasumično ćeš biti uparen s protivnikom.
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
            <p className="text-sm text-slate-500">Prijave su zatvorene — parovi se izvlače uskoro.</p>
          )}

          {/* Otkazan */}
          {tour?.status === 'finished' && tour?.cancelled && (
            <p className="text-sm text-slate-500">Turnir je otkazan — premalo prijava.</p>
          )}

          {/* Aktivan */}
          {tour?.status === 'active' && (
            <>
              {myMatch && !iPlayed ? (
                <>
                  <p className="text-sm font-semibold text-teal-700">
                    Tvoj duel je spreman{protivnik ? ` — protiv: ${protivnik}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    10 pitanja, 2 minute za cijeli duel. Ko ne odigra do roka, gubi bez borbe.
                  </p>
                  <button
                    onClick={() => navigate('/duel')}
                    className="mt-3 w-full rounded-2xl bg-teal-700 py-3.5 font-title font-extrabold text-white active:bg-teal-800"
                  >
                    Igraj svoj duel
                  </button>
                </>
              ) : myMatch && iPlayed ? (
                <p className="text-sm text-slate-500">
                  Odigrao/la si duel. Rezultat protivnika je skriven — runda se zatvara{' '}
                  {dugo(rokRunde)}.
                </p>
              ) : amRegistered ? (
                <p className="text-sm text-slate-500">
                  {matches.some((m) => m.winner === user?.uid)
                    ? 'Ispao/la si iz turnira. Prati bracket ispod.'
                    : 'Nemaš meč u ovoj rundi — čekaj sljedeću ili prati bracket ispod.'}
                </p>
              ) : (
                <p className="text-sm text-slate-500">Nisi u ovom turniru. Prati bracket ispod.</p>
              )}
            </>
          )}

          {/* Pobjednik */}
          {tour?.status === 'finished' && !tour?.cancelled && tour?.winnerUid && (
            <p className="text-sm font-semibold text-teal-700">
              {tour.winnerUid === user?.uid
                ? '🏆 Ti si šampion turnira!'
                : `🏆 Šampion: ${participants[tour.winnerUid]?.name || '—'}`}
            </p>
          )}
        </section>
      )}

      {/* Bracket */}
      {matches.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 px-1 font-title text-lg font-extrabold text-slate-900">
            Bracket
            <span className="ml-2 text-sm font-medium text-slate-400">
              {tour?.participantCount || participantCount} učesnika
            </span>
          </h2>
          <Bracket
            matches={matches}
            participants={participants}
            myUid={user?.uid}
            currentRound={tour?.currentRound || 0}
            roundDeadlines={tour?.roundDeadlines || []}
          />
        </section>
      )}
    </div>
  )
}

// "petak, 01.08. u 08:00" — evropski format, 24h, BiH vrijeme (bez oslanjanja
// na locale pregledača).
function dugo(ms) {
  if (!ms) return ''
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Sarajevo',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  )
  const dan = { Monday: 'ponedjeljak', Tuesday: 'utorak', Wednesday: 'srijeda', Thursday: 'četvrtak', Friday: 'petak', Saturday: 'subota', Sunday: 'nedjelja' }[p.weekday] || ''
  return `${dan}, ${p.day}.${p.month}. u ${p.hour}:${p.minute}`
}
