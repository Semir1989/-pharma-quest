// Linijske ikonice (teal, zaobljene) — usklađene s dizajnom prijave/registracije.
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function MailIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
      <path d="M3 6.5l9 6 9-6" />
    </svg>
  )
}

export function LockIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function EyeIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeOffIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M2 12s3.5-6.5 10-6.5c2 0 3.7.6 5.1 1.4M22 12s-3.5 6.5-10 6.5c-2 0-3.7-.6-5.1-1.4" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </svg>
  )
}

export function UserPlusIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  )
}

// ---- Ikonice donje navigacije (usklađene s dizajnom počeni ekran.png) ----

export function HomeIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6 10.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  )
}

export function QuizIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2-2.4 3.6" />
      <circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TrophyIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M8 4.5h8V8a4 4 0 0 1-8 0V4.5z" />
      <path d="M8 5.5H5.5A2.5 2.5 0 0 0 8 8" />
      <path d="M16 5.5h2.5A2.5 2.5 0 0 1 16 8" />
      <path d="M12 12v3.5" />
      <path d="M10 19.5c0-1.4.8-2 2-2s2 .6 2 2M9.5 19.5h5" />
    </svg>
  )
}

export function ClanIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c0-3 2.4-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="16.7" cy="9.2" r="2.2" />
      <path d="M16.7 13.8c2.5 0 3.8 1.7 3.8 4.2" />
    </svg>
  )
}

export function PersonIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5c0-3.6 3-6 7-6s7 2.4 7 6" />
    </svg>
  )
}
