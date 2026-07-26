import { motion } from 'framer-motion'
import Confetti from './Confetti'

const REWARD_EMOJI = {
  quizRefill: '🎟️',
  questReroll: '🔄',
  streakFreeze: '🧊',
}

// Level-up animacija. Od Etape 9 se pokreće SAMO otvaranjem kovčega u XP baru
// na početnoj — kviz, questovi i Preživljavanje je više ne prikazuju.
// props: level (novi level), rank, rankChanged (bool),
//        bonusXp (bonus za prelazak 10. levela — Etapa 8),
//        reward ({ kind, amount, label } — nagrada iz kovčega),
//        preostalo (koliko kovčega još čeka), onClose
export default function LevelUpOverlay({
  level,
  rank,
  rankChanged,
  bonusXp = 0,
  reward = null,
  preostalo = 0,
  onClose,
}) {
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

      {bonusXp > 0 && (
        <motion.div
          className="mt-4 rounded-2xl border border-amber-300/40 bg-amber-400/15 px-5 py-2.5 font-title text-lg font-extrabold text-amber-200"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.85 }}
        >
          🎁 Bonus +{bonusXp} XP!
        </motion.div>
      )}

      {reward && (
        <motion.div
          className="mt-4 flex flex-col items-center rounded-2xl border border-amber-300/40 bg-amber-400/15 px-6 py-3"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9 }}
        >
          <span className="text-xs font-bold uppercase tracking-wide text-amber-200/80">
            Iz kovčega
          </span>
          <span className="mt-0.5 font-title text-xl font-extrabold text-amber-200">
            {REWARD_EMOJI[reward.kind] || '🎁'} {reward.label}
          </span>
        </motion.div>
      )}

      {preostalo > 0 && (
        <motion.p
          className="mt-3 text-sm text-teal-100"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          Još {preostalo} {preostalo === 1 ? 'kovčeg te čeka' : 'kovčega te čeka'}
        </motion.p>
      )}

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
