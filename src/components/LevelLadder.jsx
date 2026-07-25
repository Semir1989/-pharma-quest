import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  MILESTONE_STEP,
  maxLevel,
  milestoneReward,
  nextChest,
  xpProgress,
} from '../utils/levels'

// Ljestvica levela 1 → 100 (battle-pass stil, vertikalno).
// Najviši level je gore, igrač se penje prema vrhu. Na svakom 10. levelu stoji
// kovčeg s bonus XP-om; kovčeg SE NE ISPLAĆUJE ovdje — server ga je već
// isplatio (functions/index.js, awardLevelMilestones). Otvaranje je čista
// animacija koja igraču pokaže da je nagradu dobio, jer se ranije nigdje nije
// vidjela. `opened` = users/{uid}.levelRewardOpened.
//
// props: level, xp, opened, onOpenChest(milestone)
export default function LevelLadder({ level = 1, xp = 0, opened = 0, onOpenChest }) {
  const scrollRef = useRef(null)
  const currentRef = useRef(null)
  const top = maxLevel()
  const claimable = nextChest(level, opened) // jedini kovčeg koji je sada na redu
  const progress = xpProgress(xp)

  // Pri otvaranju ekrana skrolamo na igračev level (u sredinu okvira).
  // Namjerno ne koristimo scrollIntoView — on bi pomjerio i cijelu stranicu.
  useEffect(() => {
    const box = scrollRef.current
    const row = currentRef.current
    if (!box || !row) return
    box.scrollTop = row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2
  }, [level])

  const levels = []
  for (let l = top; l >= 1; l--) levels.push(l)

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex items-baseline justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="font-title text-lg font-extrabold text-slate-900">Tvoja ljestvica</h2>
        <span className="text-xs font-bold text-slate-400">
          Level {level} / {top}
        </span>
      </div>

      <div ref={scrollRef} className="relative max-h-[26rem] overflow-y-auto px-4 py-2">
        {levels.map((l) => {
          const isCurrent = l === level
          const shared = {
            level: l,
            reached: l <= level,
            isCurrent,
            progress: isCurrent ? progress : null,
            rowRef: isCurrent ? currentRef : null,
          }

          return l % MILESTONE_STEP === 0 ? (
            <ChestRow
              key={l}
              {...shared}
              isOpened={l <= opened}
              isClaimable={l === claimable}
              onOpen={() => onOpenChest?.(l)}
            />
          ) : (
            <StepRow key={l} {...shared} />
          )
        })}
      </div>
    </div>
  )
}

// Obični level — sitna tačka na stazi.
function StepRow({ level, reached, isCurrent, progress, rowRef }) {
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
        <CurrentLabel level={level} progress={progress} />
      ) : (
        <span className={`text-sm ${reached ? 'text-slate-500' : 'text-slate-300'}`}>
          Level {level}
        </span>
      )}
    </div>
  )
}

// Prag — kovčeg s bonus XP-om.
function ChestRow({ level, reached, isCurrent, progress, isOpened, isClaimable, rowRef, onOpen }) {
  const reward = milestoneReward(level)

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
              ? `Otvori kovčeg za level ${level}`
              : `Kovčeg za level ${level} — ${isOpened ? 'otvoren' : 'zaključan'}`
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
          <CurrentLabel level={level} progress={progress} />
        ) : (
          <p
            className={`font-title text-sm font-extrabold ${
              isClaimable ? 'text-amber-600' : reached ? 'text-slate-700' : 'text-slate-400'
            }`}
          >
            Level {level}
          </p>
        )}
        <p className="text-xs text-slate-400">
          {isClaimable ? (
            <span className="font-bold text-amber-600">Pritisni kovčeg → +{reward} XP</span>
          ) : isOpened ? (
            <>+{reward} XP osvojeno</>
          ) : (
            <>Nagrada: +{reward} XP</>
          )}
        </p>
      </div>
    </div>
  )
}

// Oznaka "ti si ovdje" + koliko XP-a fali do sljedećeg levela.
function CurrentLabel({ level, progress }) {
  return (
    <div className="min-w-0">
      <p className="font-title text-sm font-extrabold text-teal-800">
        Level {level} <span className="text-teal-600">◀ TI SI OVDJE</span>
      </p>
      {progress && (
        <p className="text-xs text-slate-400">
          još {Math.max(0, progress.needed - progress.current)} XP do levela {level + 1}
        </p>
      )}
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
