// Teal gradijent zaglavlje s Pharma Quest brendom (vrh login/register ekrana).
export default function BrandHeader({ subtitle = 'Uči. Igraj. Napreduj.' }) {
  return (
    <div className="flex flex-col items-center justify-center bg-gradient-to-b from-teal-800 to-teal-900 px-6 pb-10 pt-14 text-white">
      <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-3xl bg-white/10 text-5xl">
        ⚕️
      </div>
      <h1 className="text-3xl font-extrabold tracking-wide">
        PHARMA <span className="text-teal-300">QUEST</span>
      </h1>
      <p className="mt-2 text-sm text-teal-100">{subtitle}</p>
    </div>
  )
}
