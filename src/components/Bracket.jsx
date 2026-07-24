// Bracket stablo (Faza 2, korak C) — kolone po rundama, horizontalno skrolabilno.
// Pokazuje ko je koga pobijedio; skorovi se vide tek kad je meč zatvoren.
// props: matches [{ id, round, slot, p1, p2, p1Score, p2Score, p1Played,
//        p2Played, winner, status }], participants { uid: { name } }, myUid
export default function Bracket({ matches, participants, myUid }) {
  if (!matches || matches.length === 0) return null
  const rounds = Math.max(...matches.map((m) => m.round))
  const byRound = {}
  for (const m of matches) (byRound[m.round] ||= []).push(m)
  for (const r of Object.keys(byRound)) byRound[r].sort((a, b) => a.slot - b.slot)

  const roundName = (r) => (r === rounds ? 'Finale' : r === rounds - 1 ? 'Polufinale' : `Runda ${r}`)
  const name = (uid) => (uid ? participants[uid]?.name || '???' : '—')

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3" style={{ minWidth: rounds * 158 }}>
        {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
          <div key={r} className="flex min-w-[150px] flex-1 flex-col justify-around gap-3">
            <p className="text-center text-xs font-bold uppercase tracking-wide text-slate-400">{roundName(r)}</p>
            {byRound[r].map((m) => (
              <div key={m.id} className="rounded-xl border border-slate-200 bg-white text-sm shadow-sm">
                <Row uid={m.p1} score={m.p1Score} played={m.p1Played} done={m.status === 'done'} winner={m.winner} myUid={myUid} name={name} border />
                <Row uid={m.p2} score={m.p2Score} played={m.p2Played} done={m.status === 'done'} winner={m.winner} myUid={myUid} name={name} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({ uid, score, played, done, winner, myUid, name, border }) {
  const isWinner = done && winner && winner === uid
  const isMe = uid && uid === myUid
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 ${border ? 'border-b border-slate-100' : ''} ${
        isWinner ? 'font-extrabold text-teal-700' : 'text-slate-600'
      } ${isMe ? 'bg-teal-50' : ''}`}
    >
      <span className="truncate">{name(uid)}</span>
      {done && played && <span className="ml-2 shrink-0 tabular-nums">{score ?? '–'}</span>}
    </div>
  )
}
