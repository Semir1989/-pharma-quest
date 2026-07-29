import { useCallback, useEffect, useRef, useState } from 'react'
import TimerCircle from './TimerCircle'

const LETTERS = ['A', 'B', 'C', 'D']

// Prekid duži od ovoga znači da aplikacija nije radila (zaključan ekran, poziv,
// prelazak u drugu aplikaciju), a ne da je vrijeme isteklo. Tajmeri u pozadini
// se guše ili sasvim staju, pa je razmak između dva otkucaja jedini pouzdan
// znak da nas nije bilo — `visibilitychange` ne stigne uvijek (dolazni poziv).
const PAUZA_PRAG_MS = 3000

// Ekran jednog pitanja (Etapa 6 — server verzija).
// Klijent NE ZNA tačan odgovor: šalje izbor serveru (onSubmit) i prikazuje
// feedback koji server vrati { correct, correctIndex, explanation }.
// props: question ({ index, text, options, points, seconds }), total,
//        onSubmit(selectedIndex|null) => Promise<feedback>, onNext(feedback),
//        onResume() => Promise (opciono — bez njega nema pauze)
export default function QuestionScreen({ question, total, onSubmit, onNext, onResume }) {
  const trajanje = question.seconds || 30
  const [seconds, setSeconds] = useState(trajanje)
  const [selected, setSelected] = useState(undefined) // undefined = još bira
  const [feedback, setFeedback] = useState(null) // odgovor servera
  const [error, setError] = useState(false)
  const [pauza, setPauza] = useState(false) // vraćen s pozadine, čeka "Nastavi"
  const rokRef = useRef(Date.now() + trajanje * 1000)
  const otkucajRef = useRef(Date.now())

  const answered = selected !== undefined
  const waiting = answered && !feedback && !error

  const answer = useCallback(
    async (index) => {
      setSelected(index)
      try {
        setFeedback(await onSubmit(index))
      } catch {
        setError(true)
      }
    },
    [onSubmit]
  )

  // Odbrojavanje — staje kad korisnik odgovori ili kad se ekran pauzira.
  //
  // Rok se drži kao APSOLUTNO vrijeme, ne kao brojač koji se umanjuje: kad
  // mobilni browser priguši tajmere, brojač zaostane za serverom pa je tačan
  // odgovor stizao poslije isteka i bio poništen. Ako je razmak između dva
  // otkucaja veći od praga, aplikacija je bila u pozadini — tad se ide na
  // PAUZU, nikad na "isteklo vrijeme".
  useEffect(() => {
    if (answered || pauza) return
    otkucajRef.current = Date.now()
    const t = setInterval(() => {
      const sad = Date.now()
      const razmak = sad - otkucajRef.current
      otkucajRef.current = sad
      if (razmak > PAUZA_PRAG_MS && onResume) {
        setPauza(true)
        return
      }
      const ostalo = Math.max(0, Math.ceil((rokRef.current - sad) / 1000))
      setSeconds(ostalo)
      if (ostalo === 0) answer(null)
    }, 250)
    return () => clearInterval(t)
  }, [answered, pauza, answer, onResume])

  // Odlazak u pozadinu hvatamo i direktno: kad `visibilitychange` stigne (a
  // obično stigne), pauza je postavljena PRIJE nego browser zamrzne stranicu,
  // pa zaostali otkucaj poslije povratka više nema šta poništiti.
  useEffect(() => {
    if (!onResume) return
    function naPromjenu() {
      if (document.hidden) setPauza(true)
    }
    document.addEventListener('visibilitychange', naPromjenu)
    return () => document.removeEventListener('visibilitychange', naPromjenu)
  }, [onResume])

  // "Nastavi": server pomjeri rok pitanja, pa i klijent kreće iz početka.
  const [nastavljam, setNastavljam] = useState(false)
  const [pauzaGreska, setPauzaGreska] = useState(false)
  async function nastavi() {
    if (nastavljam) return
    setNastavljam(true)
    setPauzaGreska(false)
    try {
      await onResume()
      rokRef.current = Date.now() + trajanje * 1000
      otkucajRef.current = Date.now()
      setSeconds(trajanje)
      setPauza(false)
    } catch {
      setPauzaGreska(true)
    } finally {
      setNastavljam(false)
    }
  }

  const correct = feedback?.correct

  // Pauza pokriva ekran: bez nje bi se odgovaralo na pitanje kojem je serverski
  // rok istekao, a to je izgledalo kao da igra ne priznaje tačan odgovor.
  if (pauza && !answered) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center p-6 text-center">
        <span className="text-6xl">⏸️</span>
        <h1 className="mt-4 font-title text-3xl font-extrabold text-slate-900">Pauza</h1>
        <p className="mt-2 max-w-xs text-slate-500">
          Kviz te čeka na {question.index + 1}. pitanju. Vrijeme stoji dok si odsutan/na —
          nastavi kad budeš spreman/na.
        </p>
        <button
          onClick={nastavi}
          disabled={nastavljam}
          className="mt-8 w-full max-w-xs rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800 disabled:opacity-60"
        >
          {nastavljam ? 'Nastavljam…' : 'Nastavi kviz ▶'}
        </button>
        {pauzaGreska && (
          <p className="mt-3 text-sm font-medium text-red-600">
            Nema konekcije. Pokušaj ponovo.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col p-5 pb-8">
      {/* Gornji red: progres + XP oznaka */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <span className="text-sm font-bold text-slate-500">
            {question.index + 1}/{total}
          </span>
          <div className="mt-1 h-2 w-2/3 rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-teal-700 transition-all"
              style={{ width: `${((question.index + (feedback ? 1 : 0)) / total) * 100}%` }}
            />
          </div>
        </div>
        <span className="flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-bold text-amber-600">
          +{question.points} XP ⭐
        </span>
      </div>

      {/* Tajmer */}
      <div className="mt-6 flex justify-center">
        <TimerCircle seconds={seconds} total={trajanje} />
      </div>

      {/* Kartica pitanja */}
      <div className="mt-6 rounded-2xl bg-white px-5 py-8 text-center shadow-sm">
        {/* whitespace-pre-line: pitanja s numerisanim tvrdnjama (1./2./3.) čuvaju prelome reda */}
        <h2 className="whitespace-pre-line font-title text-xl font-extrabold leading-snug text-slate-900">
          {question.text}
        </h2>
      </div>

      {/* Opcije */}
      <div className="mt-5 flex flex-col gap-3">
        {question.options.map((option, i) => (
          <button
            key={i}
            disabled={answered}
            onClick={() => answer(i)}
            className={`flex items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-left transition-colors ${optionStyle(i, selected, feedback)}`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-bold ${letterStyle(i, selected, feedback)}`}>
              {LETTERS[i]}
            </span>
            <span className="font-medium">{option}</span>
          </button>
        ))}
      </div>

      {/* Čekanje servera */}
      {waiting && (
        <p className="mt-4 text-center text-sm font-medium text-slate-400">
          Provjeravam odgovor…
        </p>
      )}

      {/* Greška mreže */}
      {error && (
        <div className="mt-4 rounded-2xl bg-red-50 p-4 text-center">
          <p className="font-bold text-red-700">Greška u konekciji.</p>
          <button
            onClick={() => {
              setError(false)
              answer(selected)
            }}
            className="mt-2 font-bold text-teal-700"
          >
            Pokušaj ponovo
          </button>
        </div>
      )}

      {/* Feedback servera: poruka + objašnjenje + dugme dalje */}
      {feedback && (
        <div className="mt-4">
          <div className={`rounded-2xl p-4 ${correct ? 'bg-emerald-50' : 'bg-red-50'}`}>
            <p className={`font-bold ${correct ? 'text-emerald-700' : 'text-red-700'}`}>
              {correct
                ? `✓ Tačno! +${question.points} XP`
                : selected === null
                  ? '⏱ Isteklo vrijeme!'
                  : '✗ Netačno.'}
            </p>
            <p className="mt-2 flex gap-2 text-sm leading-relaxed text-slate-600">
              <span>💡</span>
              <span>{feedback.explanation}</span>
            </p>
          </div>
          <button
            onClick={() => onNext(feedback)}
            className="mt-4 w-full rounded-2xl bg-teal-700 py-4 font-title text-lg font-extrabold text-white shadow-md active:bg-teal-800"
          >
            {feedback.finished ? 'Vidi rezultat →' : 'Sljedeće pitanje →'}
          </button>
        </div>
      )}
    </div>
  )
}

// Stil opcije: prije feedbacka izabrana je teal; poslije — tačna zelena,
// izabrana netačna crvena, ostale sive.
function optionStyle(i, selected, feedback) {
  if (!feedback) {
    if (i === selected) return 'border-teal-600 bg-teal-600 text-white'
    if (selected !== undefined) return 'border-slate-200 bg-white text-slate-400'
    return 'border-teal-600 bg-white text-slate-800 active:bg-teal-50'
  }
  if (i === feedback.correctIndex) return 'border-emerald-500 bg-emerald-50 text-emerald-900'
  if (i === selected) return 'border-red-400 bg-red-50 text-red-800'
  return 'border-slate-200 bg-white text-slate-400'
}

function letterStyle(i, selected, feedback) {
  if (!feedback) {
    if (i === selected) return 'border-white text-white'
    return 'border-teal-600 text-teal-700'
  }
  if (i === feedback.correctIndex) return 'border-emerald-500 bg-emerald-500 text-white'
  if (i === selected) return 'border-red-400 bg-red-400 text-white'
  return 'border-slate-200 text-slate-300'
}
