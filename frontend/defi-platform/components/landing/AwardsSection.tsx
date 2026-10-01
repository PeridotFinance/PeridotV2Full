"use client"

import Image from "next/image"
import { Trophy } from "lucide-react"
import { useReducedMotion } from "@/lib/use-reduced-motion"
import { useMobile } from "@/hooks/use-mobile"
import { FadeInOnScroll } from "@/components/shared/FadeInOnScroll"

export const AwardsSection = () => {
  const { isLowPerfDevice } = useReducedMotion()
  const isMobile = useMobile()

  return (
    <FadeInOnScroll
      className="py-16 md:py-20 bg-background relative overflow-hidden awards-section"
      threshold={0.1}
      rootMargin="-100px"
      variant="fade-in-up"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Hackathon Win Badges */}
        <div
          className="relative w-full max-w-5xl mx-auto awards-content-wrapper"
        >
          {/* Glass container with subtle background */}
          <div className="relative backdrop-blur-sm bg-white/5 dark:bg-black/5 rounded-2xl p-6 md:p-8">
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5 rounded-2xl" />

            {/* Header */}
            <div className="relative z-10 text-center mb-8">
              <div className="flex items-center justify-center gap-2 mb-3">
                <div className="w-1 h-1 bg-primary rounded-full animate-pulse" />
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="w-1 h-1 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
              <h3 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
                🏆 Award-Winning Innovation
              </h3>
              <p className="text-sm text-text/70">Some of our early winnings:</p>
            </div>

            {/* Badges grid with glass effect */}
            <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
              {[
                { src: "/hackathonwins/Group 9554.webp", alt: "Wormhole Hackathon Award", title: "Wormhole", subtitle: "Sidetrack" },
                { src: "/hackathonwins/Group 9557.webp", alt: "Stellar Kickstarter Award", title: "Stellar", subtitle: "Kickstarter" },
                { src: "/hackathonwins/Group 9559.webp", alt: "Moveathon Award", title: "Moveathon", subtitle: "Winner" },
                { src: "/hackathonwins/Group 9560.webp", alt: "The Graph side Award", title: "The Graph", subtitle: "Sidetrack" }
              ].map((badge, index) => (
                <div
                  key={index}
                  className={`awards-grid-item awards-delay-${index} relative group`}
                >
                  {/* Clean container without borders */}
                  <div className="awards-hover-card relative p-2 md:p-3 h-full flex flex-col">
                    {/* Badge Content */}
                    <div className="relative z-10 flex items-center justify-center mb-3 flex-1">
                      <div className="relative">
                        <Image
                          src={badge.src}
                          alt={badge.alt}
                          width={200}
                          height={200}
                          className="w-full h-auto max-h-[160px] md:max-h-[200px] object-contain filter group-hover:brightness-110 group-hover:saturate-110 transition-all duration-500 drop-shadow-lg"
                          priority={index < 2}
                        />
                        {/* Achievement glow behind image */}
                        <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/20 to-orange-400/20 blur-xl opacity-0 group-hover:opacity-60 transition-all duration-500 rounded-full" />
                      </div>
                    </div>

                    {/* Badge title */}
                    <div className="relative z-10 text-center mt-auto">
                      <h4 className="text-sm md:text-base font-bold text-foreground group-hover:text-primary transition-colors duration-300 leading-tight">
                        {badge.title}
                      </h4>
                      <p className="text-xs text-text/60 mt-1 group-hover:text-text/80 transition-colors duration-300 font-medium">
                        {badge.subtitle}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Text Awards List */}
            <div className="relative z-10 flex flex-col gap-3">
              {[
                { title: "XDC Hackathon", subtitle: "2nd Place" },
                { title: "XDC Sidetrack Foundation", subtitle: "1st Place" },
                { title: "Soneium DeFi", subtitle: "1st Place" }
              ].map((award, index) => (
                <div
                  key={`text-${index}`}
                  className={`awards-list-item awards-delay-${index + 4} group relative overflow-hidden rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary/30 awards-text-hover`}
                >
                  <div className="relative p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
                        <Trophy className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-foreground group-hover:text-primary transition-colors">{award.title}</span>
                        <span className="text-xs text-muted-foreground">{award.subtitle}</span>
                      </div>
                    </div>
                    <div className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 group-hover:bg-primary/20 transition-colors">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Floating ambient elements */}
            {!isLowPerfDevice && (
              <>
                <div className="absolute -top-8 -right-8 w-16 h-16 bg-primary/10 rounded-full blur-2xl animate-pulse" />
                <div className="absolute -bottom-8 -left-8 w-20 h-20 bg-accent/10 rounded-full blur-2xl animate-pulse" />
              </>
            )}
          </div>
        </div>
      </div>
    </FadeInOnScroll>
  )
}

export default AwardsSection
