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
