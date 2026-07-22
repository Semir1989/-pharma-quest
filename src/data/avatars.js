// Ponuđeni avatari (izbor pri registraciji / na profilu).
// Napomena: privremeno emoji avatari; ilustrovane avatare iz dizajna
// (onboarding.png) dodajemo kasnije kao slike.
export const AVATARS = [
  { id: 'a1', emoji: '👨‍⚕️', bg: '#0F766E' },
  { id: 'a2', emoji: '👩‍⚕️', bg: '#0D9488' },
  { id: 'a3', emoji: '🧑‍⚕️', bg: '#0891B2' },
  { id: 'a4', emoji: '👩‍🔬', bg: '#7C3AED' },
  { id: 'a5', emoji: '🧕', bg: '#D97706' },
  { id: 'a6', emoji: '👨‍🔬', bg: '#B45309' },
]

export const DEFAULT_AVATAR = 'a1'

export function avatarById(id) {
  return AVATARS.find((a) => a.id === id) || AVATARS[0]
}
