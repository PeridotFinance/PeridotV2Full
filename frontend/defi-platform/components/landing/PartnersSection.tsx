import Image from 'next/image'

const PARTNERS = [
  { name: 'Stellar Network',  logo: '/partner-assets/stellar-network-logo-.svg',              w: 110, h: 28 },
  { name: 'Magma',            logo: '/partner-assets/Magma_LogoText.svg',                      w: 96,  h: 28 },
  { name: 'Agora',            logo: '/partner-assets/agora-logo--horizontal--agora-gold.png',  w: 110, h: 32 },
  { name: 'Monad',            logo: '/partner-assets/monadtext.svg',                           w: 96,  h: 28 },
  { name: 'BNB Chain',        logo: '/partner-assets/BNB%20Chain_Logo_Black.svg',              w: 96,  h: 28 },
  { name: 'Circle',           logo: '/partner-assets/circle.svg',                              w: 72,  h: 28 },
  { name: 'Jobited',          logo: '/partner-assets/jobited.svg',                             w: 92,  h: 28 },
  { name: 'Stabble',          logo: '/partner-assets/stabble-dark.webp',                       w: 96,  h: 28 },
  { name: 'Cracked Labs',     logo: '/partner-assets/crackedlabs.webp',                        w: 92,  h: 28 },
  { name: 'LayerZero',        logo: '/misc/layerzero/layerzero-black.svg',                      w: 110, h: 28 },
]

export function PartnersSection() {
  return (
    <section
      aria-label="Our partners"
      className="relative py-10 overflow-hidden border-y border-border/40"
    >
      {/* Subtle gradient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, hsl(var(--primary)/0.03) 0%, hsl(var(--accent)/0.04) 100%)',
        }}
      />

      {/* Label */}
      <p className="text-center text-xs font-mono font-semibold tracking-[0.18em] uppercase mb-7 text-muted-foreground relative z-10">
        Building on
      </p>

      {/* Marquee wrapper with edge fades */}
      <div className="partners-fade-mask overflow-hidden relative z-10">
        {/* Track: two identical sets for seamless looping */}
        <div className="partners-track">
          {[0, 1].map((setIdx) => (
            <div
              key={setIdx}
              className="flex items-center gap-10 px-5 flex-shrink-0"
              aria-hidden={setIdx === 1}
            >
              {PARTNERS.map((p) => (
                <div
                  key={p.name}
                  className="flex-shrink-0 flex items-center justify-center partners-logo"
                  style={{ width: p.w, height: p.h }}
                  title={p.name}
                >
                  <Image
                    src={p.logo}
                    alt={p.name}
                    width={p.w}
                    height={p.h}
                    loading="lazy"
                    className="object-contain w-full h-full"
                    unoptimized={p.logo.endsWith('.svg')}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
