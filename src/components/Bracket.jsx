import { useEffect, useRef, useState } from 'react'
import Avatar from './Avatar'

// Bracket stablo 1v1 turnira — kolone po rundama, horizontalno skrolabilno.
//
// Šta je bilo pogrešno u prvoj verziji: crtale su se SVE ćelije bracketa, pa je
// turnir s 20 prijavljenih u mreži od 32 pokazivao deset praznih kartica s
// crticama umjesto imena. Igrač je skrolao kroz prazno da nađe svoj meč.
//
// Sada:
//   • meč bez ijednog imena se ne crta (server ih i briše, ovo je druga brana);
//   • bye je označen kao bye, a ne kao meč protiv crtice;
//   • runda nosi rok i stanje (završena / u toku / čeka);
//   • moj meč je istaknut i ekran se sam skroluje na tekuću rundu.
//
// props: matches [{ id, round, slot, p1, p2, p1Score, p2Score, p1Played,
//        p2Played, winner, status }], participants { uid: { name, avatar } },
//        myUid, currentRound, roundDeadlines []
export default function Bracket({ matches, participants, myUid, currentRound = 0, roundDeadlines = [] }) {
  const trakaRef = useRef(null)
  const [otvoren, setOtvoren] = useState(null) // meč čiji su detalji razvučeni

  // Prazne ćelije ne ulaze u prikaz — ni u širinu, ni u brojanje mečeva.
  const vidljivi = (matches || []).filter((m) => m.p1 || m.p2)

  // Skrol na tekuću rundu pri otvaranju: kod pet rundi finale je van ekrana, a
  // igrača zanima ono što se upravo igra.
  useEffect(() => {
    const el = trakaRef.current
    if (!el || currentRound < 2) return
    el.scrollTo({ left: (currentRound - 1) * 166, behavior: 'smooth' })
  }, [currentRound])

  if (vidljivi.length === 0) return null

  const rundi = Math.max(...vidljivi.map((m) => m.round))
  const poRundi = {}
  for (const m of vidljivi) (poRundi[m.round] ||= []).push(m)
  for (const r of Object.keys(poRundi)) poRundi[r].sort((a, b) => a.slot - b.slot)

  const imeRunde = (r) =>
    r === rundi ? '🏆 Finale' : r === rundi - 1 ? 'Polufinale' : r === rundi - 2 ? 'Četvrtfinale' : `Runda ${r}`

  return (
    <div>
      {/* Legenda — bez nje se ne zna zašto neki prolaze bez rezultata */}
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-400">
        <span>✓ pobjednik</span>
        <span>• bye — prolazi bez borbe</span>
        <span>skor se otkriva kad se runda zatvori</span>
      </div>

      <div ref={trakaRef} className="overflow-x-auto pb-2">
        <div className="flex gap-4" style={{ minWidth: rundi * 166 }}>
          {Array.from({ length: rundi }, (_, i) => i + 1).map((r) => {
            const stanje =
              currentRound === 0 ? '' : r < currentRound ? 'gotova' : r === currentRound ? 'uToku' : 'ceka'
            return (
              <div key={r} className="flex min-w-[150px] flex-1 flex-col gap-3">
                <div className="text-center">
                  <p
                    className={`text-xs font-extrabold uppercase tracking-wide ${
                      stanje === 'uToku' ? 'text-teal-700' : 'text-slate-400'
                    }`}
                  >
                    {imeRunde(r)}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                    {stanje === 'gotova'
                      ? 'završena'
                      : roundDeadlines[r - 1]
                        ? `${stanje === 'uToku' ? 'do' : 'rok'} ${kratko(roundDeadlines[r - 1])}`
                        : ' '}
                  </p>
                </div>

                <div className="flex flex-1 flex-col justify-around gap-3">
                  {poRundi[r]?.map((m) => (
                    <Mec
                      key={m.id}
                      m={m}
                      participants={participants}
                      myUid={myUid}
                      aktivna={stanje === 'uToku'}
                      otvoren={otvoren === m.id}
                      onToggle={() => setOtvoren((x) => (x === m.id ? null : m.id))}
                    />
                  ))}
                  {/* Runda u koju još niko nije prošao: prazna kolona bi
                      izgledala kao greška, pa nosi natpis. */}
                  {!poRundi[r]?.length && (
                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] font-semibold text-slate-300">
                      čeka pobjednike
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Mec({ m, participants, myUid, aktivna, otvoren, onToggle }) {
  const bye = !!(m.p1 && !m.p2) || !!(m.p2 && !m.p1)
  const mojMec = m.p1 === myUid || m.p2 === myUid
  const gotov = m.status === 'done'

  return (
    <button
      onClick={onToggle}
      className={`w-full overflow-hidden rounded-xl border bg-white text-left text-sm shadow-sm transition-colors ${
        mojMec ? 'border-teal-600 ring-2 ring-teal-500/30' : 'border-slate-200'
      } ${aktivna && !gotov ? 'shadow-md' : ''}`}
    >
      <Red uid={m.p1} score={m.p1Score} played={m.p1Played} gotov={gotov} winner={m.winner} myUid={myUid} participants={participants} linija />
      {bye ? (
        <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-300">
          bye
        </div>
      ) : (
        <Red uid={m.p2} score={m.p2Score} played={m.p2Played} gotov={gotov} winner={m.winner} myUid={myUid} participants={participants} />
      )}

      {/* Detalji na dodir: dok runda traje skor je skriven, ali se vidi KO je
          već odigrao — to je jedini podatak koji smije van bez kvarenja meča. */}
      {otvoren && !bye && (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-500">
          {gotov ? (
            m.winner ? (
              <>Prošao/la: <b className="text-teal-700">{ime(participants, m.winner)}</b></>
            ) : (
              'Niko nije prošao.'
            )
          ) : (
            <>
              Odigrali: {m.p1Played ? '✓' : '—'} {ime(participants, m.p1)} · {m.p2Played ? '✓' : '—'}{' '}
              {ime(participants, m.p2)}
            </>
          )}
        </div>
      )}
    </button>
  )
}

function Red({ uid, score, played, gotov, winner, myUid, participants, linija }) {
  const pobjednik = gotov && winner && winner === uid
  const ispao = gotov && winner && winner !== uid && uid
  const ja = uid && uid === myUid
  const p = uid ? participants?.[uid] : null

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-2 ${linija ? 'border-b border-slate-100' : ''} ${
        ja ? 'bg-teal-50/70' : ''
      } ${ispao ? 'opacity-50' : ''}`}
    >
      {uid ? (
        <Avatar id={p?.avatar} size={22} />
      ) : (
        <span className="h-[22px] w-[22px] shrink-0 rounded-full border border-dashed border-slate-200" />
      )}
      <span
        className={`min-w-0 flex-1 truncate ${
          pobjednik ? 'font-extrabold text-teal-700' : uid ? 'text-slate-600' : 'text-slate-300'
        }`}
      >
        {uid ? p?.name || 'Farmaceut' : 'čeka'}
      </span>
      {pobjednik && <span className="shrink-0 text-xs text-teal-600">✓</span>}
      {gotov && played && (
        <span className="shrink-0 font-bold tabular-nums text-slate-500">{score ?? '–'}</span>
      )}
    </div>
  )
}

function ime(participants, uid) {
  if (!uid) return '—'
  return participants?.[uid]?.name || 'Farmaceut'
}

// "sub 08:00" — dan i sat po BiH vremenu, dovoljno za rok runde.
function kratko(ms) {
  if (!ms) return ''
  return new Intl.DateTimeFormat('bs-BA', {
    timeZone: 'Europe/Sarajevo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(ms))
    .replace(',', '')
}
