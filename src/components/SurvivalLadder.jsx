import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { CHEST_STEP, MAX_STEP, chestReward, chestCount, nextChest } from '../utils/survivalLadder'

// Ljestvica Preživljavanja (battle-pass stil, vertikalno) — dokle je igrač
// stigao u nizu TE sedmice, korak 1 → 100. Najdalji korak je gore.
// Na svakom 10. koraku stoji kovčeg: 300 XP (server ga isplati čim niz dostigne
// prag) plus žetoni koje server izvuče pri otvaranju — 1 na koraku 10, 2 na 20,
// 3 na 30 … 10 na 100. Otvaranje zato više NIJE čista animacija.
//
// Ovo NIJE globalni level igrača — niz se resetuje srijedom.
//
// props: streak, opened, onOpenChest(step)
export default function SurvivalLadder({ streak = 0, opened = 0, onOpenChest }) {
  const scrollRef = useRef(null)
  const currentRef = useRef(null)
  const claimable = nextChest(streak, opened) // jedini kovčeg koji je sada na redu

  // Pri otvaranju ekrana skrolamo na igračev korak (u sredinu okvira).
  // Namjerno ne koristimo scrollIntoView — on bi pomjerio i cijelu stranicu.
  useEffect(() => {
    const box = scrollRef.current
    const row = currentRef.current
    if (!box || !row) return
    box.scrollTop = row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2
  }, [streak])

  const steps = []
  for (let s = MAX_STEP; s >= 1; s--) steps.push(s)

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex items-baseline justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="font-title text-lg font-extrabold text-slate-900">Tvoja ljestvica</h2>
        <span className="text-xs font-bold text-slate-400">
          Niz {streak} / {MAX_STEP}
        </span>
      </div>

      <div ref={scrollRef} className="relative max-h-[26rem] overflow-y-auto px-4 py-2">
        {steps.map((s) => {
          // Na nizu 0 (još nije igrao) marker stoji na prvom koraku.
          const isCurrent = s === Math.max(streak, 1)
          const shared = {
            step: s,
            reached: s <= streak,
            isCurrent,
            rowRef: isCurrent ? currentRef : null,
          }

          return s % CHEST_STEP === 0 ? (
            <ChestRow
              key={s}
              {...shared}
              isOpened={s <= opened}
              isClaimable={s === claimable}
              onOpen={() => onOpenChest?.(s)}
            />
          ) : (
            <StepRow key={s} {...shared} />
          )
        })}
      </div>
    </div>
  )
}

// Obični korak niza — sitna tačka na stazi.
function StepRow({ step, reached, isCurrent, rowRef }) {
  return (
    <div ref={rowRef} className="relative flex items-center gap-3 py-1">
      <Track reached={reached} />
      <Node>
        <span
          className={`block rounded-full ${
            isCurrent
              ? 'h-5 w-5 bg-teal-700 ring-4 ring-teal-200'
              : reached
                ? 'h-2.5 w-2.5 bg-teal-500'
                : 'h-2.5 w-2.5 bg-slate-200'
          }`}
        />
      </Node>
      {isCurrent ? (
        <CurrentLabel step={step} reached={reached} />
      ) : (
        <span className={`text-sm ${reached ? 'text-slate-500' : 'text-slate-300'}`}>
          {step}. tačan odgovor
        </span>
      )}
    </div>
  )
}

// Prag — kovčeg s bonus XP-om i žetonima (10 → 1 žeton, 20 → 2 … 100 → 10).
function ChestRow({ step, reached, isCurrent, isOpened, isClaimable, rowRef, onOpen }) {
  const reward = chestReward(step)
  const zetona = chestCount(step)
  const opis = `+${reward} XP i ${zetona} ${zetona === 1 ? 'žeton' : 'žetona'}`

  return (
    <div ref={rowRef} className="relative flex items-center gap-3 py-1.5">
      <Track reached={reached} />
      <Node>
        <motion.button
          type="button"
          onClick={isClaimable ? onOpen : undefined}
          disabled={!isClaimable}
          aria-label={
            isClaimable
              ? `Otvori kovčeg za niz ${step}`
              : `Kovčeg za niz ${step} — ${isOpened ? 'otvoren' : 'zaključan'}`
          }
          className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg shadow-sm ${
            isClaimable
              ? 'bg-amber-500 shadow-amber-300'
              : isOpened
                ? 'bg-amber-100'
                : 'bg-slate-200'
          }`}
          animate={isClaimable ? { scale: [1, 1.12, 1] } : { scale: 1 }}
          transition={isClaimable ? { duration: 1.3, repeat: Infinity } : undefined}
        >
          {isOpened ? '🎉' : isClaimable ? '🎁' : '🔒'}
        </motion.button>
      </Node>

      <div className="min-w-0 flex-1">
        {isCurrent ? (
          <CurrentLabel step={step} reached={reached} />
        ) : (
          <p
            className={`font-title text-sm font-extrabold ${
              isClaimable ? 'text-amber-600' : reached ? 'text-slate-700' : 'text-slate-400'
            }`}
          >
            Niz {step}
          </p>
        )}
        <p className="text-xs text-slate-400">
          {isClaimable ? (
            <span className="font-bold text-amber-600">Pritisni kovčeg → {opis}</span>
          ) : isOpened ? (
            <>{opis} osvojeno</>
          ) : (
            <>Nagrada: {opis}</>
          )}
        </p>
      </div>
    </div>
  )
}

// Oznaka "ti si ovdje" + koliko još fali do sljedećeg kovčega.
function CurrentLabel({ step, reached }) {
  const target = Math.min(Math.ceil((step + (reached ? 1 : 0)) / CHEST_STEP) * CHEST_STEP, MAX_STEP)
  const left = target - (reached ? step : 0)

  return (
    <div className="min-w-0">
      <p className="font-title text-sm font-extrabold text-teal-800">
        {reached ? `Niz ${step}` : 'Kreni od početka'}{' '}
        <span className="text-teal-600">◀ TI SI OVDJE</span>
      </p>
      <p className="text-xs text-slate-400">
        {left > 0 ? (
          <>
            još {left} {left === 1 ? 'tačan odgovor' : 'tačnih odgovora'} do kovčega (+
            {chestReward(target)} XP i {chestCount(target)}{' '}
            {chestCount(target) === 1 ? 'žeton' : 'žetona'})
          </>
        ) : (
          'prošao/la si cijelu ljestvicu!'
        )}
      </p>
    </div>
  )
}

// Kolona fiksne širine — drži sve čvorove (tačke i kovčege) na istoj osi.
function Node({ children }) {
  return <span className="relative z-10 flex w-9 shrink-0 justify-center">{children}</span>
}

// Vertikalna linija koja povezuje čvorove — pređeni dio je teal, ostatak siv.
// left = pola širine Node kolone (w-9 = 2.25rem).
function Track({ reached }) {
  return (
    <span
      aria-hidden
      className={`absolute bottom-0 left-[1.125rem] top-0 w-0.5 -translate-x-1/2 ${
        reached ? 'bg-teal-500' : 'bg-slate-200'
      }`}
    />
  )
}
