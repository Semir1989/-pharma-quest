import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { subscribeSurvivalRecord } from '../services/survival'
import { claimSurvivalRecordChest } from '../services/quizApi'
import { track } from '../services/analytics'
import Avatar from './Avatar'
import RecordChestOverlay from './RecordChestOverlay'

// Rekord Preživljavanja — ljestvica od jednog mjesta: NAJBOLJI NIZ IKAD.
//
// Za razliku od sedmične ljestvice, ova se ne prazni srijedom. Rekorder ostaje
// na njoj dok ga neko ne pretekne STROGO većim nizom (izjednačenje ne skida
// aktuelnog). Ko na njoj sjedi u trenutku sedmičnog restarta, dobija pet
// kovčega — iste žetone kao kod kovčega za level — i otvara ih upravo ovdje.
//
// Server drži i rekord (config/survivalRecord) i brojač kovčega
// (users/{uid}.recordChests); ovdje se oboje samo prikazuje.
export default function SurvivalRecord({ profile, uid }) {
  const [rekord, setRekord] = useState(undefined) // undefined = učitavanje
  const [otvaram, setOtvaram] = useState(false)
  const [nagrada, setNagrada] = useState(null)

  useEffect(() => subscribeSurvivalRecord(setRekord), [])

  const mojRekord = !!rekord?.uid && rekord.uid === uid
  const cekaju = profile?.recordChests || 0

  async function otvori() {
    if (otvaram || cekaju === 0) return
    setOtvaram(true)
    try {
      const r = await claimSurvivalRecordChest()
      track('record_chest_claim', { reward: r.reward?.id, preostalo: r.preostalo })
      setNagrada({ reward: r.reward, preostalo: r.preostalo })
    } catch {
      // Profil je live-pretplaćen; ako je kovčeg u međuvremenu nestao,
      // brojač se sam ispravi na sljedećem renderu.
    } finally {
      setOtvaram(false)
    }
  }

  if (nagrada) {
    return (
      <RecordChestOverlay
        reward={nagrada.reward}
        preostalo={nagrada.preostalo}
        onClose={() => setNagrada(null)}
      />
    )
  }

  // Dok se učitava ne crtamo ništa; kad rekorda još nema, kartica poziva na to
  // da ga neko postavi (inače bi ekran samo ćutao).
  if (rekord === undefined) return null

  return (
    <section className="mt-5">
      <h2 className="mb-2 px-1 font-title text-lg font-extrabold text-slate-900">
        👑 Najbolji niz ikad
      </h2>

      {rekord === null ? (
        <p className="rounded-2xl bg-white p-4 text-center text-sm text-slate-400 shadow-sm">
          Rekord još nije postavljen — prvi niz upisuje ime na ovu ploču.
        </p>
      ) : (
        <div
          className="rounded-2xl p-4 text-white shadow"
          style={{ background: 'linear-gradient(135deg, #b45309 0%, #d97706 55%, #f59e0b 100%)' }}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar id={rekord.avatar} size={48} />
              <span className="absolute -right-1 -top-2 text-xl">👑</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-title text-lg font-extrabold">{rekord.name}</p>
              <p className="text-xs text-amber-50">
                {mojRekord ? 'Ti držiš rekord — brani ga!' : 'Rekorder Preživljavanja'}
              </p>
            </div>
            <div className="text-right">
              <p className="font-title text-4xl font-extrabold leading-none">{rekord.streak}</p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-50">
                tačnih zaredom
              </p>
            </div>
          </div>

          <p className="mt-3 border-t border-white/25 pt-2 text-xs text-amber-50">
            {/* Broj prati RECORD_CHESTS u functions/index.js — mijenjati zajedno. */}
            Rekorder svake srijede u 08:00 dobija <b>5 kovčega</b>. Pretekni ga većim nizom i
            ploča je tvoja.
          </p>
        </div>
      )}

      {/* Kovčezi se otvaraju samo ovdje i samo vlasniku rekorda. */}
      {cekaju > 0 && (
        <button
          onClick={otvori}
          disabled={otvaram}
          className="mt-2 flex w-full items-center justify-between rounded-2xl bg-amber-500 px-4 py-3 text-left shadow-sm active:bg-amber-600 disabled:opacity-70"
        >
          <div className="flex items-center gap-3">
            <motion.span
              className="text-2xl"
              animate={{ rotate: [0, -8, 8, -8, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1.4 }}
            >
              🎁
            </motion.span>
            <div>
              <p className="font-title font-extrabold text-white">
                {cekaju === 1 ? 'Kovčeg za rekord te čeka!' : `${cekaju} kovčega te čeka!`}
              </p>
              <p className="text-xs text-amber-50">Nagrada za najbolji niz ikad</p>
            </div>
          </div>
          <span className="font-title text-sm font-extrabold text-white">
            {otvaram ? '…' : 'Otvori →'}
          </span>
        </button>
      )}
    </section>
  )
}
