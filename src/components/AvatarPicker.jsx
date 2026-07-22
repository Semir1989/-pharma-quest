import { AVATARS } from '../data/avatars'
import Avatar from './Avatar'

// Mreža za izbor avatara (registracija / dovršetak profila / izmjena).
export default function AvatarPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {AVATARS.map((a) => {
        const selected = a.id === value
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onChange(a.id)}
            className={`flex items-center justify-center rounded-full p-1 transition ${
              selected ? 'ring-4 ring-teal-500' : 'ring-2 ring-transparent'
            }`}
            aria-label={`Avatar ${a.id}`}
          >
            <Avatar id={a.id} size={72} />
          </button>
        )
      })}
    </div>
  )
}
