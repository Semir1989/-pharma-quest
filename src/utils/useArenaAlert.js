import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTournamentConfig, isRegisteredForDuel } from '../services/tournament'
import { useNow } from './useNow'
import { dailyKey } from './periods'

// Signal "Arena te čeka" za ikonicu u donjoj navigaciji.
//
// Pali se SAMO kad igrač ima šta uraditi:
//   survival   — Preživljavanje mu je otvoreno (nije ispao ove sedmice)
//   duel-reg   — prijave za duel su otvorene, a on se nije prijavio
//   duel-play  — turnir je živ, a on JESTE prijavljen
//
// XP trka namjerno NE pali signal — ne traži nikakvu akciju, XP se sabira sam.
//
// Bez gašenja bi signal za Preživljavanje gorio skoro cijelu sedmicu i prestao
// bi išta značiti. Zato se pamti šta je igrač već vidio (dan + skup signala):
// posjeta Areni gasi ikonicu do sutra, ali NOVI signal (npr. turnir je krenuo)
// je pali odmah, jer se skup promijenio.

const KEY = (uid) => `pq.arenaSeen.${uid}`

// Pretplaćene komponente (BottomNav, Arena) — da gašenje odmah osvježi ikonicu.
const listeners = new Set()
function notify() {
  for (const fn of listeners) fn()
}

// Prijava na duel je jedan Firestore read; keširamo je po (turnir, igrač) da je
// ne ponavljamo pri svakoj promjeni sekunde. Poslije prijave se briše.
let regCache = null // { id, promise }
function registrationFor(tid, uid) {
  const id = `${tid}|${uid}`
  if (regCache?.id !== id) regCache = { id, promise: isRegisteredForDuel(tid, uid) }
  return regCache.promise
}

// DuelCard je zove poslije uspješne prijave — 'duel-reg' mora nestati odmah.
export function refreshArenaAlert() {
  regCache = null
  notify()
}

function computeSignals({ profile, cfg, registered, now }) {
  const signals = []
  if (profile?.eventStatus?.survival === true) signals.push('survival')
  if (cfg?.enabled && cfg.key) {
    if (now >= cfg.regOpenAt && now <= cfg.regCloseAt && !registered) signals.push('duel-reg')
    if (now >= cfg.openAt && now <= cfg.closeAt && registered) signals.push('duel-play')
  }
  return signals
}

// Otisak onoga što je igrač vidio: dan + skup signala. Mijenja se i preko noći
// (novi dan → novi podsjetnik) i kad se pojavi nova mogućnost.
function stamp(signals) {
  return `${dailyKey()}|${signals.join(',')}`
}

export function useArenaAlert() {
  const { profile, user } = useAuth()
  const uid = user?.uid
  const now = useNow(30000) // faze eventa se mjere minutama, ne sekundama
  const [cfg, setCfg] = useState(null)
  const [registered, setRegistered] = useState(false)
  const [seenTick, setSeenTick] = useState(0)

  useEffect(() => {
    let alive = true
    getTournamentConfig()
      .then((c) => alive && setCfg(c))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!cfg?.key || !uid) return
    let alive = true
    registrationFor(cfg.key, uid).then((r) => alive && setRegistered(r))
    return () => {
      alive = false
    }
  }, [cfg?.key, uid, seenTick])

  // Osvježavanje kad neko drugi promijeni stanje (prijava, posjeta Areni).
  useEffect(() => {
    const fn = () => setSeenTick((t) => t + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  const signals = computeSignals({ profile, cfg, registered, now })

  let seen = null
  try {
    seen = uid ? localStorage.getItem(KEY(uid)) : null
  } catch {
    seen = null // privatni prozor / blokiran storage — signal onda uvijek gori
  }

  const markSeen = useCallback(() => {
    if (!uid) return
    try {
      localStorage.setItem(KEY(uid), stamp(signals))
    } catch {
      /* bez storagea nema gašenja — ikonica ostaje upaljena, ne pada ništa */
    }
    notify()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, signals.join(',')])

  return {
    active: signals.length > 0 && seen !== stamp(signals),
    signals,
    markSeen,
  }
}
