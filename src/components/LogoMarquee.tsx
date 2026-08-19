const CLIENTS = [
  "Sahara Group",
  "Comfort Agba Foundation",
  "Greenville LNG",
  "Lenzo Homes",
  "Up Ltd",
];

export default function LogoMarquee() {
  return (
    <section className="border-y border-mist-200 bg-mist-50 py-8 lg:py-10">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <p className="text-center text-xs uppercase tracking-[0.18em] text-slate-500">
          Trusted by leading brands and visionary homeowners
        </p>

        <div
          className="relative mt-6 overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          }}
        >
          <div className="marquee-track animate-marquee items-center">
            {[0, 1].map((rep) => (
              <div
                key={rep}
                aria-hidden={rep === 1 ? "true" : undefined}
                className="flex shrink-0 items-center gap-10 pl-10"
              >
                {CLIENTS.map((name) => (
                  <span key={name} className="flex shrink-0 items-center gap-10">
                    <span className="whitespace-nowrap text-lg font-semibold text-slate-500">
                      {name}
                    </span>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
