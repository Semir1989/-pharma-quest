import { motion } from 'framer-motion'

// Konfeti preko tamne pozadine (teal + zlatna + bijela).
// Dijele ga LevelUpOverlay i ChestOpenOverlay.
const COLORS = ['#2dd4bf', '#f59e0b', '#fbbf24', '#ffffff']
const PIECES = Array.from({ length: 36 }, (_, i) => ({
  left: `${(i * 29) % 100}%`,
  color: COLORS[i % COLORS.length],
  delay: (i % 9) * 0.22,
  duration: 2.6 + ((i * 17) % 12) / 8,
  rotate: ((i * 47) % 360) - 180,
}))

// delay: pomak (s) za sve komade — kod kovčega konfeti kreću tek kad se otvori.
export default function Confetti({ delay = 0 }) {
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
            delay: delay + p.delay,
            ease: 'easeIn',
            repeat: Infinity,
            repeatDelay: 1.2,
          }}
        />
      ))}
    </div>
  )
}
