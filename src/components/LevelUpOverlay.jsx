import { motion } from 'framer-motion'

// Level-up animacija (Modul 5) — puni ekran preko rezultata kviza.
// props: level (novi level), rank, rankChanged (bool), onClose
export default function LevelUpOverlay({ level, rank, rankChanged, onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6"
      style={{ background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Confetti />

      <motion.span
        className="text-7xl"
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: [0, 1.4, 1], rotate: 0 }}
        transition={{ duration: 0.7, times: [0, 0.6, 1] }}
      >
        ⭐
      </motion.span>

      <motion.h1
        className="mt-4 font-title text-5xl font-extrabold text-white"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        LEVEL {level}!
      </motion.h1>

      <motion.p
        className="mt-2 text-center text-teal-100"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        {rankChanged ? (
          <>
            Novi rang:{' '}
            <span className="font-bold text-amber-300">🛡️ {rank}</span>
          </>
        ) : (
          'Odlično napreduješ — nastavi tako!'
        )}
      </motion.p>

      <motion.button
        onClick={onClose}
        className="mt-10 w-full max-w-xs rounded-2xl bg-amber-500 py-4 font-title text-lg font-extrabold text-white shadow-lg active:bg-amber-600"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
      >
        Super! →
      </motion.button>
    </motion.div>
  )
}

// Konfeti preko tamne pozadine (teal + zlatna + bijela).
const COLORS = ['#2dd4bf', '#f59e0b', '#fbbf24', '#ffffff']
const PIECES = Array.from({ length: 36 }, (_, i) => ({
  left: `${(i * 29) % 100}%`,
  color: COLORS[i % COLORS.length],
  delay: (i % 9) * 0.22,
  duration: 2.6 + ((i * 17) % 12) / 8,
  rotate: ((i * 47) % 360) - 180,
}))

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {PIECES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 block h-2.5 w-2"
          style={{ left: p.left, backgroundColor: p.color, borderRadius: 2 }}
          initial={{ y: -24, opacity: 1, rotate: 0 }}
          animate={{ y: 900, opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'easeIn',
            repeat: Infinity,
            repeatDelay: 1.2,
          }}
        />
      ))}
    </div>
  )
}
