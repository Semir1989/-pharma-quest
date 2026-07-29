import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { levelFromXp } from '../utils/levels'
import MojKlan from '../components/MojKlan'
import PronadjiKlan from '../components/PronadjiKlan'
import KlanDetalji from '../components/KlanDetalji'
import KlanskiRat from '../components/KlanskiRat'
import UpravljanjeKlanom from '../components/UpravljanjeKlanom'
import TakmicenjeBanner from '../components/TakmicenjeBanner'
import {
  getClanOverview,
  createClan,
  requestJoinClan,
  approveJoinRequest,
  rejectJoinRequest,
  leaveClan,
  kickMember,
  assignAdvisor,
  removeAdvisor,
  disbandClan,
  registerForCompetition,
} from '../services/klanApi'

// Ekran klanova.
//
// Stanje dolazi iz jednog poziva (getClanOverview) i osvježava se poslije svake
// akcije. Namjerno nema Firestore listenera na dokument klana: mijenja se
// rijetko (ulazak, izlazak, uloge), a živa pretplata bi značila čitanje kod
// svakog člana pri svakoj promjeni — isti trošak protiv kojeg su išle
// optimizacije P1–P6, a bez koristi na ekranu koji se otvara povremeno.
export default function Klan() {
  const { user, profile } = useAuth()
  const [stanje, setStanje] = useState(null)
  const [radi, setRadi] = useState('')
  const [greska, setGreska] = useState('')
  const [poruka, setPoruka] = useState('')
  const [tab, setTab] = useState('moj') // moj | klanovi | upravljanje
  const [otvorenKlan, setOtvorenKlan] = useState(null) // clanId tuđeg klana

  const ucitaj = useCallback(async () => {
    try {
      setStanje(await getClanOverview())
    } catch (e) {
      setGreska(e?.message || 'Podaci o klanu nisu učitani.')
      setStanje({ clan: null })
    }
  }, [])

  useEffect(() => {
    ucitaj()
  }, [ucitaj])

  // Obavijest koju je server ostavio na profilu (promjena vodstva, izbacivanje).
  // Push nestane s ekrana, pa se ovdje pokaže i onome ko ga je propustio.
  // Odbacivanje ide u localStorage: users/{uid} klijent po pravilima smije
  // mijenjati samo u pet polja, a zbog banera ih ne vrijedi otvarati.
  const notice = profile?.clanNotice || null
  const noticeKljuc = notice ? `klanNotice:${notice.at}` : null
  const [odbacen, setOdbacen] = useState(false)
  useEffect(() => {
    setOdbacen(noticeKljuc ? localStorage.getItem(noticeKljuc) === '1' : false)
  }, [noticeKljuc])

  async function akcija(sta, arg) {
    if (radi) return
    setRadi(sta)
    setGreska('')
    setPoruka('')
    try {
      if (sta === 'create') await createClan({ name: arg.name, tag: arg.tag })
      else if (sta === 'join') {
        await requestJoinClan({ clanId: arg })
        setPoruka('Zahtjev je poslan. Osnivač ili savjetnik ga mora odobriti.')
      } else if (sta === 'approve') await approveJoinRequest({ uid: arg })
      else if (sta === 'reject') await rejectJoinRequest({ uid: arg })
      else if (sta === 'kick') await kickMember({ uid: arg })
      else if (sta === 'assignAdvisor') await assignAdvisor({ uid: arg })
      else if (sta === 'removeAdvisor') await removeAdvisor({ uid: arg })
      else if (sta === 'leave') {
        const r = await leaveClan()
        setPoruka(
          r.raspusten ? 'Izašao si i klan je raspušten — bio si zadnji član.' : 'Izašao si iz klana.'
        )
        setTab('moj')
      } else if (sta === 'disband') {
        await disbandClan()
        setPoruka('Klan je raspušten.')
        setTab('moj')
      } else if (sta === 'prijava') {
        const r = await registerForCompetition()
        setPoruka(`Klan je prijavljen za sedmicu ${r.weekId}.`)
      }
      await ucitaj()
    } catch (e) {
      setGreska(e?.message || 'Akcija nije prošla.')
    } finally {
      setRadi('')
    }
  }

  if (!profile) return null

  if (stanje === null) {
    return (
      <div className="p-4">
        <h1 className="font-title text-2xl font-extrabold text-slate-900">Klan</h1>
        <p className="mt-2 text-sm text-slate-400">Učitavam…</p>
      </div>
    )
  }

  const imamKlan = !!stanje.clan
  const uloga = stanje.uloga || null
  const mozeUpravljati = uloga === 'founder' || uloga === 'advisor'
  const brojZahtjeva = (stanje.zahtjevi || []).length

  // Sastav tuđeg klana pokriva cijeli ekran — nema ga smisla gurati u karticu
  // ispod tabova kad je to jedino što igrač u tom trenutku gleda.
  if (otvorenKlan) {
    return (
      <KlanDetalji
        clanId={otvorenKlan}
        mojUid={user?.uid}
        imamKlan={imamKlan}
        akcija={async (sta, arg) => {
          await akcija(sta, arg)
          if (sta === 'join') setOtvorenKlan(null)
        }}
        radi={radi}
        naNazad={() => setOtvorenKlan(null)}
      />
    )
  }

  return (
    <div className="pb-6">
      <div className="px-4 pt-4">
        <h1 className="font-title text-2xl font-extrabold text-slate-900">
          {imamKlan ? 'Klan' : 'Klanovi'}
        </h1>
      </div>

      {notice && !odbacen && (
        <div className="mx-4 mt-3 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <p className="text-sm font-bold text-amber-900">{notice.naslov}</p>
          <p className="mt-0.5 text-sm text-amber-800">{notice.tekst}</p>
          <button
            onClick={() => {
              localStorage.setItem(noticeKljuc, '1')
              setOdbacen(true)
            }}
            className="mt-2 text-xs font-bold text-amber-700 underline"
          >
            U redu
          </button>
        </div>
      )}

      {greska && (
        <p className="mx-4 mt-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
          {greska}
        </p>
      )}
      {poruka && (
        <p className="mx-4 mt-3 rounded-xl bg-teal-50 p-3 text-sm font-medium text-teal-800">
          {poruka}
        </p>
      )}

      {!imamKlan ? (
        <PronadjiKlan
          level={levelFromXp(profile.xp || 0)}
          mojUid={user?.uid}
          akcija={akcija}
          radi={radi}
          imamKlan={false}
          naOtvori={setOtvorenKlan}
        />
      ) : (
        <>
          <TakmicenjeBanner
            prijavljen={stanje.takmicenje?.prijavljen}
            mozePrijaviti={mozeUpravljati}
            naPrijavu={() => akcija('prijava')}
            radi={radi === 'prijava'}
          />

          {/* Tab "Klanovi" ide i članovima: sastav drugih klanova je javan
              podatak i članu treba jednako kao onome ko tek bira klan. */}
          <div className="mx-4 mt-4 flex gap-2 rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setTab('moj')}
              className={`flex-1 rounded-lg py-2 text-sm font-bold ${
                tab === 'moj' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              Moj klan
            </button>
            <button
              onClick={() => setTab('rat')}
              className={`flex-1 rounded-lg py-2 text-sm font-bold ${
                tab === 'rat' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              Rat
            </button>
            <button
              onClick={() => setTab('klanovi')}
              className={`flex-1 rounded-lg py-2 text-sm font-bold ${
                tab === 'klanovi' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              Klanovi
            </button>
            {mozeUpravljati && (
              <button
                onClick={() => setTab('upravljanje')}
                className={`flex-1 rounded-lg py-2 text-sm font-bold ${
                  tab === 'upravljanje' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                Upravljanje
                {brojZahtjeva > 0 && (
                  <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] text-white">
                    {brojZahtjeva}
                  </span>
                )}
              </button>
            )}
          </div>

          {tab === 'rat' ? (
            <KlanskiRat mojUid={user?.uid} mozeUpravljati={mozeUpravljati} />
          ) : tab === 'klanovi' ? (
            <PronadjiKlan
              level={levelFromXp(profile.xp || 0)}
              mojUid={user?.uid}
              akcija={akcija}
              radi={radi}
              imamKlan
              naOtvori={setOtvorenKlan}
            />
          ) : tab === 'upravljanje' && mozeUpravljati ? (
            <UpravljanjeKlanom
              clan={stanje.clan}
              uloga={uloga}
              clanovi={stanje.clanovi || []}
              zahtjevi={stanje.zahtjevi || []}
              mojUid={user?.uid}
              akcija={akcija}
              radi={radi}
            />
          ) : (
            <MojKlan
              clan={stanje.clan}
              uloga={uloga}
              clanovi={stanje.clanovi || []}
              mojUid={user?.uid}
              naIzlazak={() => akcija('leave')}
              radi={!!radi}
            />
          )}
        </>
      )}
    </div>
  )
}
