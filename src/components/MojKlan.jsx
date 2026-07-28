import Avatar from './Avatar'

const OZNAKA_ULOGE = {
  founder: { label: 'Osnivač', klasa: 'bg-amber-100 text-amber-800' },
  advisor: { label: 'Savjetnik', klasa: 'bg-teal-100 text-teal-800' },
  member: { label: 'Član', klasa: 'bg-slate-100 text-slate-500' },
}

// Ekran "Moj klan" — vidi ga svaki član, bez obzira na ulogu.
// Administracija (zahtjevi, izbacivanje, savjetnici) je namjerno na zasebnom
// ekranu: običnom članu ta dugmad ne trebaju, a osnivaču smetaju u listi.
export default function MojKlan({ clan, uloga, clanovi, mojUid, naIzlazak, radi }) {
  return (
    <>
      <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate font-title text-2xl font-extrabold text-slate-900">
              {clan.tag && (
                <span className="mr-1.5 rounded-lg bg-teal-700 px-2 py-0.5 align-middle text-sm font-bold text-white">
                  {clan.tag}
                </span>
              )}
              {clan.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {clan.memberCount}/{clan.maxClanova} članova · nivo klana {clan.clanLevel}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-bold text-slate-800">Članovi</h2>
        <div className="flex flex-col gap-3">
          {clanovi.map((c) => {
            const oz = OZNAKA_ULOGE[c.uloga] || OZNAKA_ULOGE.member
            return (
              <div key={c.uid} className="flex items-center gap-3">
                <Avatar id={c.avatar} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {c.ime}
                    {c.uid === mojUid && <span className="ml-1 text-xs text-slate-400">(ti)</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    Lvl {c.level} · {c.xp} XP
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${oz.klasa}`}>
                  {oz.label}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <div className="mx-4 mt-4">
        <button
          onClick={naIzlazak}
          disabled={radi}
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-bold text-slate-600 disabled:opacity-50"
        >
          {uloga === 'founder' ? 'Izađi iz klana (vodstvo prelazi na drugog)' : 'Izađi iz klana'}
        </button>
      </div>
    </>
  )
}
