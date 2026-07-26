import { avatarById } from '../data/avatars'

// Prikaz avatara. Slojevi, izvana prema unutra:
//
//   aura        sjaj IZVAN kruga (XP trka)      — span iza svega
//   ring        okvir OKO kruga (Dueli)          — span ispod avatara
//   background  pozadina UNUTAR kruga (Preživljavanje) — zamjenjuje boju avatara
//   emoji       lice
//   badges      istaknuti bedževi uz desnu ivicu
//
// Sve tri vrste kozmetike su nezavisne i mogu se nositi istovremeno. Efekti se
// vrte na svojim slojevima, nikad na emojiju — lice uvijek stoji mirno.
export default function Avatar({
  id,
  size = 48,
  className = '',
  badges = [],
  cosmetics = null, // { ring, background, aura } iz data/cosmetics.js
}) {
  const a = avatarById(id)
  const { ring, background, aura } = cosmetics || {}

  // Pozadina: kad je osvojena, zamjenjuje jednobojnu boju avatara.
  const bgStyle = background
    ? { backgroundImage: background.bg }
    : { background: a.bg }

  const krug = (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.55 }}
    >
      <span
        className={`absolute inset-0 rounded-full ${
          background?.anim ? `frame-${background.anim}` : ''
        }`}
        style={bgStyle}
      />
      <span className="relative">{a.emoji}</span>
    </div>
  )

  let jezgro = krug
  if (ring) jezgro = sOkvirom(jezgro, ring, size)
  if (aura) jezgro = sAurom(jezgro, aura, size)
  if (badges.length === 0) return jezgro

  const chip = Math.max(16, Math.round(size * 0.3))
  return (
    <div className="relative inline-block">
      {jezgro}
      <div className="absolute -right-1.5 top-0 z-10 flex flex-col gap-0.5">
        {badges.map((emoji, i) => (
          <span
            key={i}
            className="flex items-center justify-center rounded-full bg-white shadow ring-1 ring-black/5"
            style={{ width: chip, height: chip, fontSize: chip * 0.6 }}
          >
            {emoji}
          </span>
        ))}
      </div>
    </div>
  )
}

// Okvir (Dueli): prsten je zaseban element ISPOD avatara, pa se može vrtjeti a
// da lice ostane mirno. Debljina iz kataloga je zadana za avatar od 88px i
// skalira se, da okvir na 44px u leaderboardu ne proguta lice.
function sOkvirom(sadrzaj, ring, size) {
  const w = Math.max(2, Math.round((ring.width || 3) * (size / 88)))
  const vanjski = size + w * 2
  return (
    <div className="relative" style={{ width: vanjski, height: vanjski }}>
      <span
        className={`absolute inset-0 rounded-full ${ring.anim ? `frame-${ring.anim}` : ''}`}
        // MORA biti backgroundImage: skraćeni `background` resetuje
        // background-size, a inline stil pobjeđuje klasu — pa bi .frame-shine
        // ostao bez svojih 260% i sjaj se ne bi micao.
        style={{ backgroundImage: ring.ring }}
      />
      <div className="absolute" style={{ inset: w }}>
        {sadrzaj}
      </div>
    </div>
  )
}

// Aura (XP trka): sjaj izvan avatara. Dva oblika — meki halo (box-shadow koji
// diše) i rotirajući conic preliv zamućen u energiju. Aura NE mijenja veličinu
// koju element zauzima u rasporedu; širi se izvan svojih granica.
function sAurom(sadrzaj, aura, size) {
  const spread = Math.max(6, Math.round((aura.spread || 12) * (size / 88)))
  const vars = {
    '--aura-glow': aura.glow || '45,212,191',
    '--aura-spread': `${spread}px`,
  }
  return (
    <div className="relative" style={{ width: size, height: size, ...vars }}>
      {aura.sweep ? (
        <span
          className={`pointer-events-none absolute rounded-full ${
            aura.anim ? `frame-${aura.anim}` : ''
          }`}
          style={{
            inset: -spread,
            backgroundImage: aura.sweep,
            filter: `blur(${Math.max(3, Math.round(spread / 2))}px)`,
            opacity: 0.85,
          }}
        />
      ) : (
        <span
          className={`pointer-events-none absolute inset-0 rounded-full ${
            aura.anim ? `frame-${aura.anim}` : ''
          }`}
          style={
            aura.anim
              ? undefined // box-shadow dolazi iz animacije
              : { boxShadow: `0 0 ${spread}px ${spread / 3}px rgba(${aura.glow},0.5)` }
          }
        />
      )}
      <div className="relative">{sadrzaj}</div>
    </div>
  )
}
