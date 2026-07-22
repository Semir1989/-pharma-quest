// Mali kružni indikator napretka (npr. 2/3) — koristi se za taskove.
export default function CircleProgress({ value, goal, color = '#0f766e', size = 56, done = false }) {
  const stroke = 5
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const ratio = Math.min(1, goal > 0 ? value / goal : 0)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={done ? '#16a34a' : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 0.5s' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {done ? (
          <span className="text-xl text-green-600">✓</span>
        ) : (
          <span className="text-xs font-bold text-slate-700">
            {Math.min(value, goal)}/{goal}
          </span>
        )}
      </div>
    </div>
  )
}
