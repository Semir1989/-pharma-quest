import { motion } from 'framer-motion'

// Animacija otključavanja bedža (Etapa 8) — puni ekran, istog stila kao
// LevelUpOverlay ali u zlatnoj temi. Ako je igrač u istoj akciji dobio i level
// i bedž, prvo se prikazuje level-up pa onda ovo (redoslijed vodi pozivalac).
// props: badge ({ emoji, name, description }), onClose
export default function BadgeUnlockOverlay({ badge, onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6"
      style={{ background: 'linear-gradient(180deg, #b45309 0%, #78350f 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Confetti />

      <motion.p
        className="font-title text-lg font-extrabold uppercase tracking-widest text-amber-200"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Novi bedž!
      </motion.p>

      {/* Medaljon s emojijem bedža */}
      <motion.div
        className="mt-5 flex h-32 w-32 items-center justify-center rounded-3xl bg-white/95 text-6xl shadow-2xl ring-4 ring-amber-300"
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: [0, 1.35, 1], rotate: 0 }}
        transition={{ duration: 0.7, times: [0, 0.6, 1] }}
      >
        {badge.emoji}
      </motion.div>

      <motion.h1
        className="mt-6 text-center font-title text-4xl font-extrabold text-white"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        {badge.name}
      </motion.h1>

      {badge.description && (
        <motion.p
          className="mt-2 text-center text-amber-100"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          {badge.description}
        </motion.p>
      )}

      <motion.button
        onClick={onClose}
        className="mt-10 w-full max-w-xs rounded-2xl bg-white py-4 font-title text-lg font-extrabold text-amber-700 shadow-lg active:bg-amber-50"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
      >
        Super! →
      </motion.button>
    </motion.div>
  )
}

// Konfeti (zlatna + bijela) preko tamnozlatne pozadine.
const COLORS = ['#fbbf24', '#f59e0b', '#fde68a', '#ffffff']
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
