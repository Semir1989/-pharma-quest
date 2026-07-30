// Prekidač notifikacija u zaglavlju Profila, uz avatar — jedan dodir, bez
// traženja po ekranu. Sekcija ispod ostaje za pojedine vrste poruka i za
// objašnjenje kad uređaj ne može primati push (iPhone bez instalacije, blokirana
// dozvola), pa se ovdje u tim slučajevima ništa ne nudi: dodir ionako ne bi
// uradio ništa, a zvono koje ne reaguje izgleda kao kvar.
// `tamno` — za tealno zaglavlje Profila; bez njega je varijanta za svijetlu
// pozadinu (Home).
// `kompaktno` — kad su notifikacije uključene, ostaje samo ikona. Na Home ekranu
// zvono stoji uz Lvl i streak, pa bi puni natpis oduzimao pažnju od brojeva
// zbog kojih se ekran i otvara; kad su isključene, natpis se vraća jer je tad
// poziv na akciju.
export default function NotifikacijeZvono({ notif, tamno = false, kompaktno = false }) {
  const { stanje, radi, ukljuceno, prekidacRadi, prebaci } = notif

  if (stanje === null || stanje === 'nema-kljuca' || !prekidacRadi) return null

  const samoIkona = kompaktno && ukljuceno
  const boja = ukljuceno
    ? tamno
      ? 'bg-white/15 text-white'
      : 'bg-white text-slate-500 shadow-sm'
    : 'bg-amber-500 text-white shadow'

  // Dok su notifikacije isključene, zvono svijetli i zvoni — bez njih igrač ne
  // sazna ni da mu je klan u ratu ni da mu je protivnik odigrao duel. Čim se
  // uključe, klase nestaju i animacija staje u istom kadru (vidi index.css).
  // Za vrijeme samog prebacivanja se ne animira: dugme je tad zauzeto.
  const trazipaznju = !ukljuceno && !radi

  return (
    <button
      onClick={prebaci}
      disabled={radi}
      aria-pressed={ukljuceno}
      aria-label={ukljuceno ? 'Isključi notifikacije' : 'Uključi notifikacije'}
      title={ukljuceno ? 'Notifikacije su uključene' : 'Notifikacije su isključene'}
      className={`flex shrink-0 items-center gap-1.5 rounded-xl text-sm font-bold transition disabled:opacity-60 ${
        samoIkona ? 'px-2.5 py-1' : 'px-3 py-1.5'
      } ${boja} ${trazipaznju ? 'zvono-halo' : ''}`}
    >
      <span className={`text-base leading-none ${trazipaznju ? 'zvono-zvoni' : ''}`}>
        {radi ? '…' : ukljuceno ? '🔔' : '🔕'}
      </span>
      {!samoIkona && <span>{ukljuceno ? 'Uključene' : 'Uključi'}</span>}
    </button>
  )
}
