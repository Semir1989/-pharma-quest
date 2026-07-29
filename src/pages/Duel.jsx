import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startDuel, submitDuelAnswer } from '../services/quizApi'
import { track } from '../services/analytics'
import DuelQuestionScreen from '../components/quiz/DuelQuestionScreen'

const LETTERS = ['A', 'B', 'C', 'D']

// Duel play (Faza 2, korak C) — 10 istih pitanja kao protivnik, JEDAN tajmer od
// 120 sekundi za sve, bez zastajanja između pitanja.
//
// Skor se upisuje u meč, a protivnikov rezultat je skriven do zatvaranja runde.
// Kod istog broja tačnih prolazi onaj ko je duel završio ranije (server:
// resolveMatch), pa se vrijeme ovdje ne troši ni na jedan ekran viška —
// pregled tačnih odgovora ide tek poslije završetka.
export default function Duel() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('loading') // loading | playing | done | nomatch | error
  const [question, setQuestion] = useState(null)
  const [total, setTotal] = useState(10)
  const [totalSeconds, setTotalSeconds] = useState(120)
  const [deadline, setDeadline] = useState(0)
  const [myScore, setMyScore] = useState(0)
  const [isteklo, setIsteklo] = useState(false)
  const [caka, setCaka] = useState(false) // čeka se odgovor servera
  const [pregled, setPregled] = useState([]) // {text, options, selected, correctIndex, explanation}
  const cakaRef = useRef(false) // isto što i `caka`, ali čitljivo odmah
  const istekCekaRef = useRef(false) // istek stigao dok je odgovor bio u letu

  useEffect(() => {
    let cancelled = false
    startDuel()
      .then((res) => {
        if (cancelled) return
        if (res.noMatch) return setPhase('nomatch')
        if (res.alreadyPlayed) {
          setMyScore(res.score || 0)
          setTotal(res.total || 10)
          setIsteklo(!!res.isteklo)
          return setPhase('done')
        }
        setTotal(res.total || 10)
        setTotalSeconds(res.totalSeconds || 120)
        setDeadline(Date.now() + (res.secondsLeft ?? res.totalSeconds ?? 120) * 1000)
        setQuestion(res.question)
        setPhase('playing')
        track('duel_start')
      })
      .catch(() => !cancelled && setPhase('error'))
    return () => {
      cancelled = true
    }
  }, [])

  // Jedan put kroz odgovor i kroz istek — oba završavaju isto, razlikuje ih
  // samo `kraj` zastavica koju server tumači kao "zatvori duel odmah".
  const posalji = useCallback(
    async (index, { kraj = false } = {}) => {
      if (cakaRef.current) return
      cakaRef.current = true
      setCaka(true)
      try {
        const res = await submitDuelAnswer(index, { kraj })
        if (!kraj && res.correctIndex !== undefined && question) {
          setPregled((p) => [
            ...p,
            {
              text: question.text,
              options: question.options,
              selected: index,
              correctIndex: res.correctIndex,
              explanation: res.explanation,
              correct: res.correct,
            },
          ])
        }
        if (res.finished) {
          istekCekaRef.current = false // duel je gotov, kraj se više ne šalje
          setMyScore(res.myScore || 0)
          setTotal(res.total || total)
          setIsteklo(!!res.isteklo)
          setPhase('done')
          track('duel_complete', { score: res.myScore || 0, isteklo: !!res.isteklo })
          return
        }
        // Sat se sinhronizuje sa serverom poslije svakog odgovora — mrežno
        // kašnjenje se tako ne gomila u korist igrača.
        if (res.secondsLeft !== undefined) setDeadline(Date.now() + res.secondsLeft * 1000)
        setQuestion(res.question)
      } catch {
        istekCekaRef.current = false
        setPhase('error')
      } finally {
        cakaRef.current = false
        setCaka(false)
      }
    },
    [question, total]
  )

  const naOdgovor = useCallback((index) => posalji(index), [posalji])

  // Istek se ne smije izgubiti ako je u tom trenutku odgovor bio u letu: tad se
  // zapamti i pošalje čim server odgovori (osim ako je taj odgovor ionako
  // završio duel).
  const naIstek = useCallback(() => {
    if (cakaRef.current) {
      istekCekaRef.current = true
      return
    }
    posalji(null, { kraj: true })
  }, [posalji])

  useEffect(() => {
    if (caka || !istekCekaRef.current || phase !== 'playing') return
    istekCekaRef.current = false
    posalji(null, { kraj: true })
  }, [caka, phase, posalji])

  if (phase === 'playing' && question) {
    return (
      <DuelQuestionScreen
        question={question}
        total={total}
        deadline={deadline}
        totalSeconds={totalSeconds}
        onAnswer={naOdgovor}
        onTimeout={naIstek}
        caka={caka}
      />
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center p-6 pb-10">
      {phase === 'loading' && (
        <p className="mt-auto mb-auto text-slate-400">Pokrećem duel…</p>
      )}

      {phase === 'done' && (
        <div className="w-full max-w-md">
          <div className="mt-6 text-center">
            <h1 className="font-title text-3xl font-extrabold text-slate-900">Tvoj rezultat</h1>
            <p className="mt-3 font-title text-6xl font-extrabold text-teal-700">
              {myScore}
              <span className="text-3xl text-slate-400">/{total}</span>
            </p>
            {isteklo && (
              <p className="mt-2 text-sm font-bold text-red-600">
                ⏱ Isteklo je vrijeme — neodgovorena pitanja se broje kao netačna.
              </p>
            )}
            <p className="mt-3 text-slate-500">
              Rezultat protivnika je skriven do zatvaranja runde. Kod istog broja tačnih
              prolazi onaj ko je duel odigrao ranije.
            </p>
          </div>

          {pregled.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 font-title text-lg font-extrabold text-slate-900">
                Pregled odgovora
              </h2>
              <div className="flex flex-col gap-3">
                {pregled.map((p, i) => (
                  <div key={i} className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="whitespace-pre-line text-sm font-bold text-slate-800">
                      {i + 1}. {p.text}
                    </p>
                    <p className="mt-2 text-sm text-emerald-700">
                      ✓ {LETTERS[p.correctIndex]}. {p.options[p.correctIndex]}
                    </p>
                    {!p.correct && (
                      <p className="text-sm text-red-600">
                        {p.selected === null || p.selected === undefined
                          ? 'Bez odgovora'
                          : `✗ ${LETTERS[p.selected]}. ${p.options[p.selected]}`}
                      </p>
                    )}
                    {p.explanation && (
                      <p className="mt-2 flex gap-2 text-sm leading-relaxed text-slate-600">
                        <span>💡</span>
                        <span>{p.explanation}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {phase === 'nomatch' && (
        <div className="mt-auto text-center">
          <h1 className="font-title text-2xl font-extrabold text-slate-900">Nemaš duel za sada</h1>
          <p className="mt-2 text-slate-500">Nisi u tekućoj rundi ili turnir nije aktivan.</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-auto text-center">
          <h1 className="font-title text-2xl font-extrabold text-slate-900">Greška</h1>
          <p className="mt-2 text-slate-500">Ne mogu pokrenuti duel. Pokušaj ponovo.</p>
        </div>
      )}

      {phase !== 'playing' && phase !== 'loading' && (
        <button
          onClick={() => navigate('/turnir')}
          className="mb-2 mt-8 w-full max-w-xs rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800"
        >
          Nazad na turnir
        </button>
      )}
    </div>
  )
}
