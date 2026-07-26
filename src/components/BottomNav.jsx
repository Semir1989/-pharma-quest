import { NavLink } from 'react-router-dom'
import { HomeIcon, QuizIcon, ArenaIcon, ClanIcon, PersonIcon } from './icons'
import { useAuth } from '../context/AuthContext'
import { useArenaAlert } from '../utils/useArenaAlert'
import { useNow } from '../utils/useNow'
import { quizEnergy } from '../utils/quizEnergy'

// Donja navigacija — linijske ikonice usklađene s dizajnom (počeni ekran.png).
// Arena je stalno mjesto za sva takmičenja (dueli, XP trka, Preživljavanje),
// pa početni ekran ostaje čist bez obzira koliko eventa dodamo.
// Questovi imaju svoju rutu, ali se do njih ulazi s kartice na početnoj.
//
// Dvije ikonice mogu svijetliti:
//   Kviz  — igrač ima bar jedan pokušaj (energija > 0)
//   Arena — u Areni ima nešto aktivno za uraditi
// Signal je isti u oba slučaja: amber tačkica + spori halo. Tačkica nosi
// informaciju i kad je animacija ugašena (prefers-reduced-motion).
const TABS = [
  { to: '/', label: 'Home', Icon: HomeIcon },
  { to: '/kviz', label: 'Kviz', Icon: QuizIcon, alert: 'quiz' },
  { to: '/arena', label: 'Arena', Icon: ArenaIcon, alert: 'arena' },
  { to: '/klan', label: 'Klan', Icon: ClanIcon },
  { to: '/profil', label: 'Profil', Icon: PersonIcon },
]

export default function BottomNav() {
  const { profile } = useAuth()
  const { active: arenaAlert } = useArenaAlert()
  // Energija se regeneriše s vremenom, pa se ikonica mora upaliti sama kad
  // prag prođe — bez ovog otkucaja bi čekala sljedeći render.
  const now = useNow(30000)
  const quizAlert = quizEnergy(profile, now).energy > 0

  const gori = { quiz: quizAlert, arena: arenaAlert }

  return (
    <nav className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 justify-around border-t border-slate-200 bg-white pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-1">
      {TABS.map(({ to, label, Icon, alert }) => {
        const glowing = !!alert && gori[alert]
        return (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-1 px-2 pt-2 text-xs font-medium ${
                isActive ? 'text-teal-700' : glowing ? 'text-amber-600' : 'text-slate-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 h-1 w-8 rounded-full bg-teal-600" />
                )}
                <span className="relative">
                  {/* Halo iza ikonice — sporo pulsiranje, gasi se uz
                      prefers-reduced-motion (vidi index.css). */}
                  {glowing && (
                    <span className="arena-halo pointer-events-none absolute inset-0 rounded-full" />
                  )}
                  <Icon className="relative h-6 w-6" />
                  {/* Tačkica nosi informaciju i bez animacije. */}
                  {glowing && (
                    <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" />
                  )}
                </span>
                {label}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}
