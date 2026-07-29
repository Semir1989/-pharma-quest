import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getTournamentConfig, isRegisteredForDuel } from '../services/tournament'
import { subscribeSurvivalConfig, survivalOpen } from '../services/survival'
import { survivalWeekKey } from './periods'
import { useNow } from './useNow'

// Signal "Arena te čeka" za ikonicu u donjoj navigaciji.
//
// Gori DOK GOD ima nečega aktivnog u Areni — ulazak u Arenu ga ne gasi.
// (Ranije se gasio na posjetu, pa je nestajao i kad igrač uđe a ne odigra
// ništa; to je bilo pogrešno — signal prati stanje, ne to jesi li ga vidio.)
//
// Signali:
//   survival   — Preživljavanje ti je otvoreno (nisi ispao ove sedmice)
//   duel-reg   — prijave za duel otvorene, a nisi prijavljen
//   duel-play  — turnir živ, a jesi prijavljen
//   xp-race    — XP trka je u toku

const listeners = new Set()
function notify() {
  for (const fn of listeners) fn()
}

// Prijava na duel je jedan Firestore read; keširamo je po (turnir, igrač) da je
// ne ponavljamo pri svakom otkucaju. Poslije prijave se briše.
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

// Preživljavanje gori kad je prozor eventa otvoren I igrač nije ispao u
// TEKUĆOJ sedmici. Oba podatka su živa: prozor stiže pretplatom na
// config/survival, ispadanje s profila. Zato se ikonica upali sama u srijedu u
// 08:00 i ugasi u trenutku ispadanja, bez reloada.
//
// Ranije se gledala samo zastavica eventStatus.survival, koju je server
// osvježavao jednom dnevno (pri prvom izboru dnevnih questova). Ko je otvorio
// aplikaciju prije nego se prozor otvori, ostajao je tamni cijeli dan iako je
// smio igrati; a `false` od prošle sedmice nikad nije bio vraćen na `true`.
// Zastavica se sada koristi SAMO za ispadanje, uz sedmicu na koju se odnosi.
function survivalSignal(profile, scfg, now) {
  if (scfg === undefined) return false // config se još učitava — ne trepći uprazno
  const es = profile?.eventStatus
  const ispao = es?.survival === false && es?.survivalWeek === survivalWeekKey(new Date(now))
  return survivalOpen(scfg, now) && !ispao
}

function computeSignals({ profile, cfg, scfg, registered, now }) {
  const signals = []
  if (survivalSignal(profile, scfg, now)) signals.push('survival')
  if (cfg?.enabled && cfg.key) {
    if (now >= cfg.regOpenAt && now <= cfg.regCloseAt && !registered) signals.push('duel-reg')
    if (now >= cfg.openAt && now <= cfg.closeAt) {
      if (registered) signals.push('duel-play')
      signals.push('xp-race')
    }
  }
  return signals
}

export function useArenaAlert() {
  const { profile, user } = useAuth()
  const uid = user?.uid
  const now = useNow(30000) // faze eventa se mjere minutama, ne sekundama
  const [cfg, setCfg] = useState(null)
  const [scfg, setScfg] = useState(undefined) // prozor Preživljavanja (živo)
  const [registered, setRegistered] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    getTournamentConfig()
      .then((c) => alive && setCfg(c))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => subscribeSurvivalConfig(setScfg), [])

  useEffect(() => {
    if (!cfg?.key || !uid) return
    let alive = true
    registrationFor(cfg.key, uid).then((r) => alive && setRegistered(r))
    return () => {
      alive = false
    }
  }, [cfg?.key, uid, tick])

  // Osvježavanje kad se prijava promijeni u nekoj drugoj komponenti.
  useEffect(() => {
    const fn = () => setTick((t) => t + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  const signals = computeSignals({ profile, cfg, scfg, registered, now })
  return { active: signals.length > 0, signals }
}
