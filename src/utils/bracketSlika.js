// Ekstenzija u putanji je namjerna (ostatak src/ je bez nje): ovaj modul se
// učitava i golim Nodeom u testu scripts/test-bracket-slika.mjs, a Node ESM ne
// pogađa ekstenziju kao Vite.
import { avatarById } from '../data/avatars.js'

// Izvoz bracketa 1v1 turnira kao slike 4:5 (01.08.2026).
//
// Zašto crtanje po canvasu, a ne "snimak" DOM-a: html2canvas i slični alati su
// nova zavisnost od nekoliko stotina kilobajta, a i dalje ne bi dali ono što
// treba — bracket na ekranu je horizontalno skrolabilna traka širine pet
// kolona, dok slika za objavu mora stati u uspravan format 4:5 i biti čitljiva
// kao slika, ne kao snimak ekrana. Zato se crta zasebno.
//
// Format 4:5 (1080×1350) je Instagramov uspravni post — najveća površina koju
// feed prikazuje bez opsjecanja.

export const SIRINA = 1080
export const VISINA = 1350

const BOJE = {
  pozadinaGore: '#0f5750',
  pozadinaDolje: '#072826',
  kartica: '#ffffff',
  kartcaIspao: '#e9eef0',
  tekst: '#0f172a',
  tekstBlijedi: '#94a3b8',
  pobjednik: '#0f766e',
  zlatna: '#d97706',
  bijela: '#ffffff',
  teal100: '#ccfbf1',
}

// Ime runde po istom pravilu kao u komponenti Bracket.
function imeRunde(r, rundi) {
  if (r === rundi) return 'FINALE'
  if (r === rundi - 1) return 'POLUFINALE'
  if (r === rundi - 2) return 'ČETVRTFINALE'
  return `RUNDA ${r}`
}

function skrati(ctx, tekst, maxSirina) {
  if (ctx.measureText(tekst).width <= maxSirina) return tekst
  let t = tekst
  while (t.length > 1 && ctx.measureText(t + '…').width > maxSirina) t = t.slice(0, -1)
  return t + '…'
}

function zaobljeni(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Nacrtaj bracket i vrati sliku kao Blob (PNG, 1080×1350).
 *
 * @param {object[]} matches      mečevi turnira ({ round, slot, p1, p2, p1Score,
 *                                p2Score, winner, kvalifikacija, status })
 * @param {object}   participants { uid: { name, avatar } }
 * @param {object}   turnir       { rounds, participantCount, winnerUid, key }
 */
export async function nacrtajBracket({ matches, participants, turnir }) {
  const platno = document.createElement('canvas')
  platno.width = SIRINA
  platno.height = VISINA
  const ctx = platno.getContext('2d')

  // Prazne ćelije se ne crtaju — isto pravilo kao u prikazu na ekranu.
  const vidljivi = (matches || []).filter((m) => m.p1 || m.p2)
  if (vidljivi.length === 0) throw new Error('Bracket je prazan.')
  const rundi = Math.max(...vidljivi.map((m) => m.round))

  const poRundi = {}
  for (const m of vidljivi) (poRundi[m.round] ||= []).push(m)
  for (const r of Object.keys(poRundi)) poRundi[r].sort((a, b) => a.slot - b.slot)

  // --- pozadina -------------------------------------------------------------
  const preliv = ctx.createLinearGradient(0, 0, 0, VISINA)
  preliv.addColorStop(0, BOJE.pozadinaGore)
  preliv.addColorStop(1, BOJE.pozadinaDolje)
  ctx.fillStyle = preliv
  ctx.fillRect(0, 0, SIRINA, VISINA)

  // --- zaglavlje ------------------------------------------------------------
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  ctx.fillStyle = BOJE.bijela
  ctx.font = '800 62px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillText('⚔️ 1v1 ARENA', SIRINA / 2, 92)

  const ucesnika = turnir?.participantCount || new Set(vidljivi.flatMap((m) => [m.p1, m.p2]).filter(Boolean)).size
  ctx.fillStyle = BOJE.teal100
  ctx.font = '600 30px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillText(`${ucesnika} učesnika · ${rundi} rundi · Pharma Quest`, SIRINA / 2, 138)

  // Šampion odmah ispod naslova: to je jedini podatak zbog kojeg se slika i
  // dijeli, pa ne smije biti na dnu gdje ga skraćeni prikaz odsiječe.
  const sampion = turnir?.winnerUid ? participants?.[turnir.winnerUid]?.name : null
  let vrhTabele = 190
  if (sampion) {
    ctx.fillStyle = BOJE.zlatna
    ctx.font = '800 44px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillText(`🏆 ${skrati(ctx, sampion, SIRINA - 160)}`, SIRINA / 2, 196)
    vrhTabele = 240
  }

  // --- mreža rundi ----------------------------------------------------------
  const margina = 24
  const razmak = 14
  const dnoTeksta = 44 // traka s datumom na dnu
  const sirinaKolone = (SIRINA - 2 * margina - (rundi - 1) * razmak) / rundi
  const visinaZaglavljaKolone = 46
  const vrhMeceva = vrhTabele + visinaZaglavljaKolone
  const raspoloziva = VISINA - vrhMeceva - dnoTeksta - margina

  // Visina kartice se izvodi iz NAJDUŽE runde, pa cijelo stablo stane bez
  // skrola. Kod velikog turnira kartice se stisnu, ali ostanu čitljive jer se
  // s njima skalira i tekst.
  const maxMeceva = Math.max(...Object.values(poRundi).map((l) => l.length))
  const visinaCelije = Math.min(140, raspoloziva / maxMeceva)
  // Kartica NIKAD ne smije biti viša od ćelije u koju je smještena — donja
  // granica ovdje bi kod velikog turnira gurnula kartice jednu preko druge, a
  // to se na slici vidi kao pomiješana imena. Umjesto toga se odustaje.
  if (visinaCelije < 26) {
    throw new Error('Previše učesnika za jednu sliku — stablo ne stane u format 4:5.')
  }
  const visinaKartice = visinaCelije - 8
  const fontImena = Math.max(12, Math.min(24, visinaKartice / 3.4))

  for (let r = 1; r <= rundi; r++) {
    const x = margina + (r - 1) * (sirinaKolone + razmak)
    const lista = poRundi[r] || []

    ctx.textAlign = 'center'
    ctx.fillStyle = r === rundi ? BOJE.zlatna : BOJE.teal100
    ctx.font = `800 ${Math.min(24, sirinaKolone / 6)}px system-ui, -apple-system, Segoe UI, sans-serif`
    ctx.fillText(
      skrati(ctx, imeRunde(r, rundi), sirinaKolone),
      x + sirinaKolone / 2,
      vrhTabele + 30
    )

    // Mečevi runde se raspoređuju po visini kolone: runda s manje mečeva ih
    // razmakne, pa stablo i bez linija izgleda kao stablo.
    const korak = raspoloziva / lista.length
    lista.forEach((m, i) => {
      const y = vrhMeceva + i * korak + (korak - visinaKartice) / 2
      nacrtajMec(ctx, m, participants, x, y, sirinaKolone, visinaKartice, fontImena)
    })
  }

  // --- podnožje -------------------------------------------------------------
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(204,251,241,0.75)'
  ctx.font = '600 24px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.fillText(`igra.farmaceutupraksi.ba · ${datumTurnira(turnir)}`, SIRINA / 2, VISINA - 26)

  return await new Promise((res, rej) =>
    platno.toBlob((b) => (b ? res(b) : rej(new Error('Slika nije napravljena.'))), 'image/png')
  )
}

// Jedan meč = dva reda (ili jedan kod byea/kvalifikacije).
function nacrtajMec(ctx, m, participants, x, y, w, h, font) {
  const sam = !!(m.p1 && !m.p2) || !!(m.p2 && !m.p1)
  const redova = sam ? 1 : 2
  const visinaReda = h / redova

  ctx.fillStyle = BOJE.kartica
  zaobljeni(ctx, x, y, w, h, Math.min(12, h / 4))
  ctx.fill()

  const igraci = sam ? [m.p1 || m.p2] : [m.p1, m.p2]
  igraci.forEach((uid, i) => {
    const ry = y + i * visinaReda
    const pobijedio = m.status === 'done' && m.winner && m.winner === uid
    const ispao = m.status === 'done' && uid && m.winner !== uid

    if (pobijedio) {
      ctx.fillStyle = 'rgba(15,118,110,0.10)'
      zaobljeni(ctx, x, ry + 1, w, visinaReda - 2, Math.min(10, visinaReda / 3))
      ctx.fill()
    }

    // Avatar (emoji) — isti izvor kao u aplikaciji, pa se lica poklapaju.
    const p = uid ? participants?.[uid] : null
    const promjer = Math.min(visinaReda - 8, 34)
    const cx = x + 10 + promjer / 2
    const cy = ry + visinaReda / 2
    if (uid) {
      const a = avatarById(p?.avatar)
      ctx.fillStyle = a.bg
      ctx.beginPath()
      ctx.arc(cx, cy, promjer / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `${Math.round(promjer * 0.6)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
      ctx.fillText(a.emoji, cx, cy + 1)
    }

    // Ime
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = pobijedio ? BOJE.pobjednik : ispao ? BOJE.tekstBlijedi : BOJE.tekst
    ctx.font = `${pobijedio ? 800 : 600} ${font}px system-ui, -apple-system, Segoe UI, sans-serif`
    const xIme = x + promjer + 18
    const rezervaSkor = m.status === 'done' ? 34 : 8
    ctx.fillText(
      skrati(ctx, p?.name || (uid ? 'Farmaceut' : '—'), w - (xIme - x) - rezervaSkor),
      xIme,
      cy
    )

    // Skor se piše tek kad je runda zatvorena — do tada je i u aplikaciji
    // skriven, pa ga ni slika ne smije otkriti.
    if (m.status === 'done') {
      const skor = uid === m.p1 ? m.p1Score : m.p2Score
      if (skor !== null && skor !== undefined) {
        ctx.textAlign = 'right'
        ctx.fillStyle = pobijedio ? BOJE.pobjednik : BOJE.tekstBlijedi
        ctx.font = `700 ${font}px system-ui, -apple-system, Segoe UI, sans-serif`
        ctx.fillText(String(skor), x + w - 10, cy)
      }
    }
  })

  // Oznaka samačkog slota: isti oblik, dva različita ishoda.
  if (sam) {
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = m.kvalifikacija ? BOJE.zlatna : BOJE.tekstBlijedi
    ctx.font = `700 ${Math.max(10, font * 0.6)}px system-ui, -apple-system, Segoe UI, sans-serif`
    ctx.fillText(m.kvalifikacija ? 'KVAL' : 'BYE', x + w - 10, y + h / 2)
  }
}

function datumTurnira(turnir) {
  const ms = turnir?.finishedAt?.toMillis?.() || turnir?.finishedAt || Date.now()
  return new Intl.DateTimeFormat('bs-BA', {
    timeZone: 'Europe/Sarajevo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(ms))
}

/**
 * Nacrtaj i ponudi sliku korisniku: dijeljenje (mobitel) ili preuzimanje.
 * Vraća 'podijeljeno' | 'preuzeto'.
 */
export async function izvuciBracketSliku(podaci) {
  const blob = await nacrtajBracket(podaci)
  const ime = `pharma-quest-turnir-${podaci?.turnir?.key || 'bracket'}.png`
  const fajl = new File([blob], ime, { type: 'image/png' })

  // Na telefonu je dijeljenje jedini put do galerije i Instagrama; provjera
  // canShare je obavezna jer Chrome na desktopu ima navigator.share bez
  // podrške za fajlove i poziv bi pukao.
  if (navigator.canShare?.({ files: [fajl] })) {
    try {
      await navigator.share({ files: [fajl], title: 'Pharma Quest — 1v1 turnir' })
      return 'podijeljeno'
    } catch (e) {
      // Korisnik je odustao od dijeljenja — to nije greška, ali ni razlog da mu
      // se datoteka nametne preuzimanjem.
      if (e?.name === 'AbortError') return 'podijeljeno'
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = ime
  a.click()
  // Odgođeno oslobađanje: neki pregledači preuzimanje pokrenu asinhrono i
  // odmah opozvan URL im ostane prazan.
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return 'preuzeto'
}
