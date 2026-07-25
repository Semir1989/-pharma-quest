import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Confetti from './Confetti'
import { MILESTONE_STEP, maxLevel, milestoneReward } from '../utils/levels'

// Animacija otvaranja kovčega (nagrada za svaki 10. level).
// XP je server već isplatio (functions/index.js, awardLevelMilestones) — ovo je
// prikaz nagrade, ne isplata. Zato tekst govori "osvojio si", ne "dobijaš".
//
// props: level (prag, npr. 10), reward (bonus XP), onClose
const SHAKE_MS = 1100

export default function ChestOpenOverlay({ level, reward, onClose }) {
  const [open, setOpen] = useState(false)

  // Kovčeg se prvo trese, pa "pukne". Preskakanje na dodir da igrač ne čeka.
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
        className="mb-6 font-title text-sm font-extrabold uppercase tracking-widest text-teal-200"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        Nagrada za level {level}
      </motion.p>

      {/* Zlatni bljesak u trenutku otvaranja */}
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
          <motion.p
            className="mt-6 font-title text-5xl font-extrabold text-amber-300"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, type: 'spring', stiffness: 260, damping: 14 }}
          >
            +{reward} XP
          </motion.p>
          <motion.p
            className="mt-3 max-w-xs text-center text-sm text-teal-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            Ovaj bonus ti je već upisan na račun.{' '}
            {level + MILESTONE_STEP <= maxLevel()
              ? `Svaki 10. level nosi novi kovčeg — sljedeći je na levelu ${level + MILESTONE_STEP} (+${milestoneReward(level + MILESTONE_STEP)} XP).`
              : 'Otvorio/la si posljednji kovčeg na ljestvici — svaka čast!'}
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
