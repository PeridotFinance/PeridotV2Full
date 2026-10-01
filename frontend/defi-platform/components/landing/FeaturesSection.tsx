"use client"

import { Button } from "@/components/ui/button"
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useMobile } from "@/hooks/use-mobile"
import { useReducedMotion } from "@/lib/use-reduced-motion"
import { useFadeInOnScroll } from "@/hooks/use-fade-in-on-scroll"
import { FloatingElement } from "@/components/shared/FloatingElement"
import { FadeInOnScroll } from "@/components/shared/FadeInOnScroll"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  BarChart3,
  Lock,
  Wallet,
  Coins,
  ArrowUpDown,
  Shield,
  Globe,
  Users,
} from "lucide-react"
import Link from "next/link"

// Interactive 3D card component (simplified for this example, assuming it's defined elsewhere or not strictly needed for static part of section)
const InteractiveCard = ({ children, className }: { children: React.ReactNode; className?: string; }) => {
  return <div className={cn("relative overflow-hidden transition-all duration-200", className)}>{children}</div>;
};

// FeatureCard (assuming props are passed or it's self-contained)
interface FeatureCardProps {
  icon: React.ElementType
  title: string
  description: string
  delay?: number
}

const FeatureCard = ({ icon: Icon, title, description, delay = 0 }: FeatureCardProps) => {
  const { isLowPerfDevice } = useReducedMotion()
  const isMobile = useMobile()
  
  // CRITICAL: Call ALL hooks before any conditional returns to avoid React error #300
  const { ref: fadeRef } = useFadeInOnScroll({
    threshold: 0.1,
    rootMargin: "-50px",
    delay: isMobile ? 0 : delay * 1000,
    variant: "fade-in-up",
  })

  if (isLowPerfDevice) {
    return (
      <div className={cn(
        "bg-white/60 dark:bg-card/60 border border-white/20 dark:border-white/10 h-full group rounded-2xl transition-shadow hover:shadow-lg backdrop-blur-sm",
        isMobile ? "p-4 flex items-start gap-3" : "p-6"
      )}>
        <div className={cn(
          "relative flex-shrink-0",
          isMobile ? "mb-0" : "mb-4"
        )}>
          <div className={cn(
            "relative z-10 text-primary flex items-center justify-center bg-primary/10 rounded-xl border border-primary/10",
            isMobile ? "h-10 w-10" : "h-12 w-12"
          )}>
            <Icon className={isMobile ? "h-5 w-5" : "h-6 w-6"} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={cn(
            "font-semibold text-foreground",
            isMobile ? "text-base mb-2" : "text-lg mb-3"
          )}>{title}</h3>
          <p className={cn(
            "text-muted-foreground leading-relaxed",
            isMobile ? "text-xs" : "text-sm"
          )}>{description}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={fadeRef as React.RefObject<HTMLDivElement>}
      className="h-full"
    >
      <InteractiveCard className={cn(
        "bg-white/60 dark:bg-card/60 border border-white/20 dark:border-white/10 h-full group rounded-2xl hover:shadow-lg transition-all duration-300 backdrop-blur-sm shadow-sm",
        isMobile ? "flex items-start gap-3" : ""
      )}>
        <CardHeader className={cn(
          isMobile ? "p-4 flex-row items-start gap-3 space-y-0" : "p-6"
        )}>
          <div className={cn(
            "relative flex-shrink-0",
            isMobile ? "mb-0" : "mb-4"
          )}>
            {/* Animated sine wave background */}
            <div className={cn(
              "absolute inset-0 rounded-lg overflow-hidden",
              isMobile ? "opacity-50" : ""
            )}>
              <svg 
                className="absolute inset-0 w-full h-full" 
                viewBox="0 0 100 100" 
                preserveAspectRatio="none"
              >
                <motion.path
                  d="M0,50 Q25,20 50,50 T100,50 L100,100 L0,100 Z"
                  fill="rgba(98, 163, 82, 0.08)"
                  className="dark:fill-[rgba(98,163,82,0.15)]"
                  animate={{
                    d: [
                      "M0,50 Q25,20 50,50 T100,50 L100,100 L0,100 Z",
                      "M0,50 Q25,80 50,50 T100,50 L100,100 L0,100 Z",
                      "M0,50 Q25,20 50,50 T100,50 L100,100 L0,100 Z"
                    ]
                  }}
                  transition={{
                    duration: 2.5 + (delay || 0) * 0.5,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut"
                  }}
                />
                <motion.path
                  d="M0,60 Q25,30 50,60 T100,60 L100,100 L0,100 Z"
                  fill="rgba(98, 163, 82, 0.05)"
                  className="dark:fill-[rgba(98,163,82,0.1)]"
                  animate={{
                    d: [
                      "M0,60 Q25,30 50,60 T100,60 L100,100 L0,100 Z",
                      "M0,60 Q25,90 50,60 T100,60 L100,100 L0,100 Z", 
                      "M0,60 Q25,30 50,60 T100,60 L100,100 L0,100 Z"
                    ]
                  }}
                  transition={{
                    duration: 3.2 + (delay || 0) * 0.7,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                    delay: 0.5
                  }}
                />
              </svg>
            </div>
            <motion.div
              className={cn(
                "relative z-10 text-primary flex items-center justify-center bg-white/80 dark:bg-primary/10 rounded-lg shadow-sm dark:shadow-none border border-primary/10 dark:border-transparent",
                isMobile ? "h-10 w-10" : "h-12 w-12"
              )}
              whileHover={{ rotate: 5, scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <Icon className={isMobile ? "h-5 w-5" : "h-6 w-6"} />
            </motion.div>
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className={cn(
              "font-semibold text-foreground",
              isMobile ? "text-base mb-2" : "text-lg mb-3"
            )}>{title}</CardTitle>
            <CardDescription className={cn(
              "text-muted-foreground leading-relaxed",
              isMobile ? "text-xs" : "text-sm"
            )}>{description}</CardDescription>
          </div>
        </CardHeader>
      </InteractiveCard>
    </div>
  )
}



export const FeaturesSection = () => {
  const isMobile = useMobile()
  
  return (
    <section className="py-16 md:py-20 bg-background relative overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Main Content Container with Leaderboard-style Background */}
        <div 
          className="relative rounded-3xl border border-black/5 dark:border-white/5 bg-white/40 dark:bg-black/20 backdrop-blur-xl overflow-hidden p-6 md:p-10 lg:p-12"
          style={{
            backgroundImage: 'radial-gradient(60rem 40rem at 50% -20%, rgba(94,121,69,0.10), transparent), radial-gradient(50rem 40rem at 90% 100%, rgba(99,102,241,0.08), transparent)'
          }}
        >
          <FadeInOnScroll
            className="text-center max-w-2xl mx-auto mb-12 md:mb-16 relative z-10"
            threshold={0.1}
            rootMargin="-50px"
          >
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-foreground">
              Why Choose <span className="gradient-text">Peridot</span>?
            </h2>
            <FadeInOnScroll
              as="p"
              className="text-base md:text-lg text-muted-foreground leading-relaxed"
              threshold={0.1}
              rootMargin="-50px"
              delay={200}
            >
              Experience the future of DeFi lending with our secure, transparent, and user-friendly platform designed for both newcomers and experts.
            </FadeInOnScroll>
          </FadeInOnScroll>

          {/* Optimized grid for mobile: 1 column on mobile, 2 on tablet, 4 on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 relative z-10">
            <FeatureCard
              icon={Coins}
              title="Access Liquidity Instantly"
              description="Borrow against your crypto without selling. Keep your assets while accessing the funds you need."
              delay={0.1}
            />
            <FeatureCard
              icon={ArrowUpDown}
              title="Earn While You Hold"
              description="Generate passive income on your idle crypto assets with competitive market-driven interest rates."
              delay={0.2}
            />
            <FeatureCard
              icon={Shield}
              title="100% Secure & Transparent"
              description="All transactions are secured by smart contracts and fully auditable on the blockchain."
              delay={0.3}
            />
            <FeatureCard
              icon={BarChart3}
              title="No Paperwork Required"
              description="Get instant access to funds without lengthy applications, credit checks, or waiting periods."
              delay={0.4}
            />
          </div>

          {/* Mobile-optimized CTA */}
          <FadeInOnScroll
            className="text-center mt-12 md:mt-16 relative z-10"
            threshold={0.1}
            rootMargin="-50px"
            delay={500}
          >
            <Link href="/app" passHref>
              <Button
                size={isMobile ? "default" : "lg"}
                className="bg-primary text-primary-foreground hover:bg-primary-foreground hover:text-primary border border-primary/20 hover:border-primary/40 transition-all duration-300 font-semibold px-8 py-3 rounded-xl shadow-lg shadow-primary/20"
              >
                Start Earning Today
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </FadeInOnScroll>
        </div>
      </div>
    </section>
  )
}

export default FeaturesSection; 