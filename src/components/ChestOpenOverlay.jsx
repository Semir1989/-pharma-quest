import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Confetti from './Confetti'

// Animacija otvaranja kovčega na ljestvici Preživljavanja.
// XP je server već isplatio u trenutku kad je niz dostigao prag
// (functions/index.js, survivalChestReward), a ŽETONE je izvukao pri otvaranju
// (claimSurvivalChest) — ovo je prikaz nagrade, ne isplata.
//
// props: step (prag niza, npr. 10), reward (bonus XP), nagrade (izvučeni
//        žetoni: [{ kind, amount, label }]), nextStep, nextReward, nextCount,
//        onClose. nextStep = 0 kad je ovo posljednji kovčeg na ljestvici.
const SHAKE_MS = 1100

// Ikone žetona — iste kao na kovčegu za level (LevelUpOverlay).
const ZETON_IKONA = {
  quizRefill: '🎟️',
  questReroll: '🔄',
  questRerollWeekly: '📅',
  questRerollMonthly: '🗓️',
  streakFreeze: '🧊',
}

export default function ChestOpenOverlay({
  step,
  reward,
  nagrade = [],
  nextStep = 0,
  nextReward = 0,
  nextCount = 0,
  onClose,
}) {
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
        className="mb-6 font-title text-sm font-extrabold uppercase tracking-widest text-teal-200"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        Niz od {step} tačnih
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

          {/* Žetoni iz kovčega — koliko ih prag nosi, toliko ih je izvučeno. */}
          {nagrade.length > 0 && (
            <motion.div
              className="mt-4 flex w-full max-w-xs flex-col gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              {nagrade.map((n, i) => (
                <span
                  key={i}
                  className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-teal-50"
                >
                  <span className="text-lg leading-none">{ZETON_IKONA[n.kind] || '🎁'}</span>
                  {n.label}
                </span>
              ))}
            </motion.div>
          )}

          <motion.p
            className="mt-3 max-w-xs text-center text-sm text-teal-100"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            Sve ti je već upisano na račun.{' '}
            {nextStep
              ? `Sljedeći kovčeg je na nizu ${nextStep} — nosi +${nextReward} XP i ${nextCount} ${nextCount === 1 ? 'žeton' : 'žetona'}.`
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
