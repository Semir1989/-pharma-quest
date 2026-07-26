import { avatarById } from '../data/avatars'

// Prikaz avatara (krug s emojijem na obojenoj pozadini).
//
// `badges` su emojiji istaknutih bedževa. Slažu se u niz uz DESNU ivicu, jer
// profili ispod avatara drže "Lvl" pilulu — red ispod bi se s njom sudarao.
//
// `frame` je okvir iz data/cosmetics.js. Prsten je zaseban element ISPOD
// avatara, pa se može vrtjeti a da lice ostane mirno. Debljina iz kataloga je
// zadana za avatar od 88px i skalira se s veličinom, da okvir na 44px u
// leaderboardu ne proguta lice.
export default function Avatar({ id, size = 48, className = '', badges = [], frame = null }) {
  const a = avatarById(id)

  // className ostaje na samom krugu (pozivaoci njime dodaju ring), pa se
  // ponašanje bez okvira i bedževa ni u čemu ne mijenja.
  const krug = (
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

  const jezgro = frame ? withFrame(krug, frame, size) : krug
  if (badges.length === 0) return jezgro

  const chip = Math.max(16, Math.round(size * 0.3))
  return (
    <div className="relative inline-block">
      {jezgro}
      <div className="absolute -right-1.5 top-0 flex flex-col gap-0.5">
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

function withFrame(krug, frame, size) {
  const w = Math.max(2, Math.round((frame.width || 3) * (size / 88)))
  const vanjski = size + w * 2

  return (
    <div className="relative" style={{ width: vanjski, height: vanjski }}>
      <span
        className={`absolute inset-0 rounded-full ${frame.anim ? `frame-${frame.anim}` : ''}`}
        style={{
          // MORA biti backgroundImage, ne skraćeni `background`: skraćeni oblik
          // resetuje background-size, a inline stil pobjeđuje klasu — pa bi
          // .frame-shine ostao bez svojih 260% i sjaj se ne bi micao.
          backgroundImage: frame.ring,
          // Boja pulsiranja ide kroz varijablu, da keyframes ostanu jedni za sve.
          ...(frame.glow ? { '--frame-glow': frame.glow } : null),
        }}
      />
      <div className="absolute" style={{ inset: w }}>
        {krug}
      </div>
    </div>
  )
}
