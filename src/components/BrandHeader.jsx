import epcLogo from '../assets/epc-logo.png'

// Zaglavlje prijave/registracije — usklađeno s dizajnom (prijava-registracija.png).
export default function BrandHeader({ subtitle = 'Uči. Igraj. Napreduj.' }) {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 pb-12 pt-14 text-white"
      style={{
        background: 'linear-gradient(180deg, #0f5750 0%, #0a3b36 100%)',
      }}
    >
      {/* EPC logo (Edu Pharma Community) */}
      <div className="mb-5 rounded-2xl bg-white p-3 shadow-lg">
        <img
          src={epcLogo}
          alt="Edu Pharma Community"
          className="h-20 w-20 object-contain"
        />
      </div>

      {/* Naslov PHARMA QUEST */}
      <div className="font-title text-center leading-none">
        <div
          className="text-5xl font-extrabold tracking-wide text-white"
          style={{ textShadow: '0 2px 6px rgba(0,0,0,0.35)' }}
        >
          PHARMA
        </div>
        <div className="mt-1 flex items-center justify-center gap-3">
          <span className="h-0.5 w-7 rounded-full" style={{ background: '#f0b429' }} />
          <span
            className="text-5xl font-black tracking-wide"
            style={{ color: '#2dd4bf', textShadow: '0 2px 6px rgba(0,0,0,0.35)' }}
          >
            QUEST
          </span>
          <span className="h-0.5 w-7 rounded-full" style={{ background: '#f0b429' }} />
        </div>
      </div>

      <p className="mt-4 text-base font-medium text-teal-50">{subtitle}</p>
    </div>
  )
}
