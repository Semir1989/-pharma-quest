import { avatarById } from '../data/avatars'

// Prikaz avatara (krug s emojijem na obojenoj pozadini).
export default function Avatar({ id, size = 48, className = '' }) {
  const a = avatarById(id)
  return (
    <div
      className={`flex items-center justify-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: a.bg,
        fontSize: size * 0.55,
      }}
    >
      <span>{a.emoji}</span>
    </div>
  )
}
