import { useState } from 'react'
import { motion } from 'framer-motion'
import { claimLevelChest } from '../services/quizApi'
import { track } from '../services/analytics'
import { levelFromXp, rankFromLevel } from '../utils/levels'
import LevelUpOverlay from './LevelUpOverlay'

// Kovčezi za pređene levele — stoje uz XP bar na početnoj.
//
// Svaki pređeni level ostavlja jedan kovčeg. Ako igrač u jednom kvizu skoči s
// levela 1 na 3, čekaju ga dva — otvaraju se redom, od najnižeg. Animacija
// level-upa se prikazuje SAMO ovdje; kviz, questovi i Preživljavanje je više
// ne pokreću, da nagrada ima jedno mjesto i da je igrač ne propusti usput.
export default function LevelChests({ profile }) {
  const [otvaram, setOtvaram] = useState(false)
  const [levelUp, setLevelUp] = useState(null)

  const level = levelFromXp(profile?.xp)
  // Polje ne postoji zatečenim igračima — tretira se kao 1 (početni level), pa
  // im kovčezi za već pređene levele legnu odmah.
  const claimed = profile?.levelChestClaimed || 1
  const cekaju = Math.max(0, level - claimed)

  async function otvori() {
    if (otvaram || cekaju === 0) return
    setOtvaram(true)
    try {
      const r = await claimLevelChest()
      track('level_chest_claim', { level: r.level, reward: r.reward?.id })
      const stari = r.level - 1
      setLevelUp({
        level: r.level,
        rank: rankFromLevel(r.level),
        rankChanged: rankFromLevel(r.level) !== rankFromLevel(stari),
        preostalo: r.preostalo,
        reward: r.reward,
      })
    } catch {
      // Profil je live-pretplaćen; ako je kovčeg u međuvremenu nestao,
      // brojač se sam ispravi na sljedećem renderu.
    } finally {
      setOtvaram(false)
    }
  }

  if (levelUp) {
    return (
      <LevelUpOverlay
        level={levelUp.level}
        rank={levelUp.rank}
        rankChanged={levelUp.rankChanged}
        reward={levelUp.reward}
        preostalo={levelUp.preostalo}
        onClose={() => setLevelUp(null)}
      />
    )
  }

  if (cekaju === 0) return null

  return (
    <button
      onClick={otvori}
      disabled={otvaram}
      className="mt-3 flex w-full items-center justify-between rounded-2xl bg-amber-500 px-4 py-3 text-left shadow-sm active:bg-amber-600 disabled:opacity-70"
    >
      <div className="flex items-center gap-3">
        <motion.span
          className="text-2xl"
          animate={{ rotate: [0, -8, 8, -8, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1.4 }}
        >
          🎁
        </motion.span>
        <div>
          <p className="font-title font-extrabold text-white">
            {cekaju === 1 ? 'Kovčeg te čeka!' : `${cekaju} kovčega te čeka!`}
          </p>
          <p className="text-xs text-amber-50">
            {cekaju === 1 ? 'Prešao/la si novi level' : 'Otvaraju se jedan po jedan'}
          </p>
        </div>
      </div>
      <span className="font-title text-sm font-extrabold text-white">
        {otvaram ? '…' : 'Otvori →'}
      </span>
    </button>
  )
}
