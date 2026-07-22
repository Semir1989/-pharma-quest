// Kružni tajmer (SVG) — prikazuje preostale sekunde za pitanje.
const SIZE = 96
const STROKE = 7
const R = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * R

export default function TimerCircle({ seconds, total }) {
  const ratio = Math.max(0, seconds / total)
  const low = seconds <= 5
  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none" stroke="#e2e8f0" strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke={low ? '#dc2626' : '#0f766e'}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-title text-3xl font-extrabold ${low ? 'text-red-600' : 'text-slate-800'}`}>
          {seconds}
        </span>
        <span className="-mt-1 text-xs font-semibold text-slate-400">s</span>
      </div>
    </div>
  )
}
