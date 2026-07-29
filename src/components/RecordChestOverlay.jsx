import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Confetti from './Confetti'

// Animacija otvaranja kovčega za rekord Preživljavanja.
//
// Odvojena od ChestOpenOverlay (kovčeg na ljestvici niza) jer nagrada nije
// XP nego žeton — isti bubanj kao kod kovčega za level, pa je i prikaz
// nagrade isti kao u LevelUpOverlay. Server je žeton već upisao na profil
// dok se ovo vrti; ovo je prikaz, ne isplata.
//
// props: reward ({ kind, label }), preostalo (koliko kovčega još čeka), onClose
const REWARD_EMOJI = {
  quizRefill: '🎟️',
  questReroll: '🔄',
  streakFreeze: '🧊',
}

const SHAKE_MS = 1100

export default function RecordChestOverlay({ reward, preostalo = 0, onClose }) {
  const [open, setOpen] = useState(false)

  // Kovčeg se prvo trese, pa "pukne". Dodir preskače čekanje.
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), SHAKE_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6"
      style={{ background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={() => setOpen(true)}
    >
      {open && <Confetti />}

      <motion.p
        className="mb-6 font-title text-sm font-extrabold uppercase tracking-widest text-amber-200"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        👑 Nagrada za rekord
      </motion.p>

      {open && (
        <motion.span
          className="pointer-events-none absolute h-40 w-40 rounded-full bg-amber-300 blur-3xl"
          initial={{ opacity: 0.9, scale: 0.3 }}
          animate={{ opacity: 0, scale: 3 }}
          transition={{ duration: 0.9 }}
          aria-hidden
        />
      )}

      <motion.span
        className="relative text-8xl"
        animate={
          open
            ? { rotate: 0, scale: [1, 1.5, 1.2], y: [0, -16, 0] }
            : { rotate: [-8, 8, -8], scale: 1 }
        }
        transition={
          open
            ? { duration: 0.6, times: [0, 0.5, 1] }
            : { duration: 0.35, repeat: Infinity, ease: 'easeInOut' }
        }
      >
        {open ? '🎉' : '🎁'}
      </motion.span>

      {open ? (
        <>
          <motion.div
            className="mt-6 flex flex-col items-center rounded-2xl border border-amber-300/40 bg-amber-400/15 px-6 py-3"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, type: 'spring', stiffness: 260, damping: 14 }}
          >
            <span className="text-xs font-bold uppercase tracking-wide text-amber-200/80">
              Iz kovčega
            </span>
            <span className="mt-0.5 font-title text-xl font-extrabold text-amber-200">
              {REWARD_EMOJI[reward?.kind] || '🎁'} {reward?.label}
            </span>
          </motion.div>

          <motion.p
            className="mt-3 max-w-xs text-center text-sm text-teal-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {preostalo > 0
              ? `Još ${preostalo} ${preostalo === 1 ? 'kovčeg te čeka' : 'kovčega te čeka'} — drži rekord i sljedeće srijede.`
              : 'Držiš najbolji niz ikad — brani ga do sljedeće srijede!'}
          </motion.p>

          <motion.button
            onClick={onClose}
            className="mt-10 w-full max-w-xs rounded-2xl bg-amber-500 py-4 font-title text-lg font-extrabold text-white shadow-lg active:bg-amber-600"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            Super! →
          </motion.button>
        </>
      ) : (
        <p className="mt-8 animate-pulse text-sm font-bold text-teal-100">Otvaram…</p>
      )}
    </motion.div>
  )
}
