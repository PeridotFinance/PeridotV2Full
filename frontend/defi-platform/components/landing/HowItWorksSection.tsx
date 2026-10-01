"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { useMobile } from "@/hooks/use-mobile"
import { FloatingElement } from "@/components/shared/FloatingElement"
import { FadeInOnScroll } from "@/components/shared/FadeInOnScroll"
import { cn } from "@/lib/utils"

// MagneticButton (simplified, assuming defined elsewhere or props passed)
const MagneticButton = ({ children, className = "", ...props }: { children: React.ReactNode; className?: string; [key: string]: any; }) => {
  return <div className={cn("relative", className)} {...props}>{children}</div>;
};

export const HowItWorksSection = () => {
  const isMobile = useMobile()
  
  return (
    <section className="py-16 md:py-20 bg-background relative overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Main Content Container with Leaderboard-style Background */}
        <div 
          className="relative rounded-3xl border border-black/5 dark:border-white/5 bg-white/40 dark:bg-black/20 backdrop-blur-xl overflow-hidden p-6 md:p-10 lg:p-12"
          style={{
            backgroundImage: 'radial-gradient(60rem 40rem at 90% 10%, rgba(94,121,69,0.12), transparent), radial-gradient(50rem 40rem at 10% 100%, rgba(99,102,241,0.08), transparent)'
          }}
        >
          <FadeInOnScroll
            className="text-center max-w-2xl mx-auto mb-12 md:mb-16 relative z-10"
            threshold={0.1}
            rootMargin="-50px"
          >
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-foreground">
              How <span className="gradient-text">Peridot</span> Works
            </h2>
            <FadeInOnScroll
              as="p"
              className="text-base md:text-lg text-muted-foreground leading-relaxed"
              threshold={0.1}
              rootMargin="-50px"
              delay={200}
            >
              Our platform creates efficient money markets for crypto assets with algorithmically determined interest rates.
            </FadeInOnScroll>
          </FadeInOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 relative z-10">
            <FadeInOnScroll
              className={cn(
                "bg-white/60 dark:bg-card/60 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl shadow-sm relative hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5",
                isMobile ? "p-4" : "p-6"
              )}
              threshold={0.1}
              rootMargin="-50px"
              variant="fade-in-up-30"
            >
              <div className={cn(
                "absolute rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-primary/20",
                isMobile ? "-top-4 -left-4 w-8 h-8 text-sm" : "-top-5 -left-5 w-10 h-10 text-lg"
              )}>
                <motion.span
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                >
                  1
                </motion.span>
              </div>
              <motion.div
                className="absolute -z-10 inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0"
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              <h3 className={cn(
                "font-bold text-foreground",
                isMobile ? "text-lg mb-3 mt-1" : "text-xl mb-4 mt-2"
              )}>Supply Assets</h3>
              <p className={cn(
                "text-muted-foreground mb-4",
                isMobile ? "text-sm" : "text-base"
              )}>Deposit your crypto to start earning interest.</p>
              <ul className={cn(
                "space-y-2 text-muted-foreground",
                isMobile ? "text-xs" : "text-sm"
              )}>
                <FadeInOnScroll
                  as="li"
                  className="flex items-start"
                  threshold={0.1}
                  rootMargin="-50px"
                  delay={isMobile ? 0 : 100}
                  variant="fade-in-left"
                >
                  <div className={cn(
                    "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                    isMobile ? "mt-0.5" : ""
                  )}>
                    <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                  </div>
                  <span>Receive tokens (pTokens) that show your deposit</span>
                </FadeInOnScroll>
                <FadeInOnScroll
                  as="li"
                  className="flex items-start"
                  threshold={0.1}
                  rootMargin="-50px"
                  delay={isMobile ? 0 : 200}
                  variant="fade-in-left"
                >
                  <div className={cn(
                    "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                    isMobile ? "mt-0.5" : ""
                  )}>
                    <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                  </div>
                  <span>Your balance automatically grows with interest</span>
                </FadeInOnScroll>
                <FadeInOnScroll
                  as="li"
                  className="flex items-start"
                  threshold={0.1}
                  rootMargin="-50px"
                  delay={isMobile ? 0 : 300}
                  variant="fade-in-left"
                >
                  <div className={cn(
                    "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                    isMobile ? "mt-0.5" : ""
                  )}>
                    <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                  </div>
                  <span>Withdraw your crypto whenever you want—no waiting period</span>
                </FadeInOnScroll>
              </ul>
            </FadeInOnScroll>

            <FadeInOnScroll
              className={cn(
                "bg-white/60 dark:bg-card/60 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl shadow-sm relative hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5",
                isMobile ? "p-4" : "p-6"
              )}
              threshold={0.1}
              rootMargin="-50px"
              delay={isMobile ? 0 : 200}
              variant="fade-in-up-30"
            >
              <div className={cn(
                "absolute rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-primary/20",
                isMobile ? "-top-4 -left-4 w-8 h-8 text-sm" : "-top-5 -left-5 w-10 h-10 text-lg"
              )}>
                <motion.span
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, delay: 0.3 }}
                >
                  2
                </motion.span>
              </div>
              <motion.div
                className="absolute -z-10 inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0"
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              <h3 className={cn(
                "font-bold text-foreground",
                isMobile ? "text-lg mb-3 mt-1" : "text-xl mb-4 mt-2"
              )}>Collateralize</h3>
              <p className={cn(
                "text-muted-foreground mb-4",
                isMobile ? "text-sm" : "text-base"
              )}>
                Your deposited crypto acts as collateral, letting you borrow other assets.
              </p>
              <ul className={cn(
                "space-y-2 text-muted-foreground",
                isMobile ? "text-xs" : "text-sm"
              )}>
                <FadeInOnScroll
                  as="li"
                  className="flex items-start"
                  threshold={0.1}
                  rootMargin="-50px"
                  delay={isMobile ? 0 : 300}
                  variant="fade-in-left"
                >
                  <div className={cn(
                    "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                    isMobile ? "mt-0.5" : ""
                  )}>
                    <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                  </div>
                  <span>Each asset has a limit on how much you can borrow</span>
                </FadeInOnScroll>
                <FadeInOnScroll
                  as="li"
                  className="flex items-start"
                  threshold={0.1}
                  rootMargin="-50px"
                  delay={isMobile ? 0 : 400}
                  variant="fade-in-left"
                >
                  <div className={cn(
                    "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                    isMobile ? "mt-0.5" : ""
                  )}>
                    <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                  </div>
                  <span>Keep a healthy balance so you don't risk liquidation</span>
                </FadeInOnScroll>
                <FadeInOnScroll
                  as="li"
                  className="flex items-start"
                  threshold={0.1}
                  rootMargin="-50px"
                  delay={isMobile ? 0 : 500}
                  variant="fade-in-left"
                >
                  <div className={cn(
                    "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                    isMobile ? "mt-0.5" : ""
                  )}>
                    <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                  </div>
                  <span>Supports collateral from different blockchains for extra flexibility</span>
                </FadeInOnScroll>
              </ul>
            </FadeInOnScroll>

            <FadeInOnScroll
              className={cn(
                "bg-white/60 dark:bg-card/60 backdrop-blur-md border border-white/20 dark:border-white/10 rounded-2xl shadow-sm relative hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5",
                isMobile ? "p-4" : "p-6"
              )}
              threshold={0.1}
              rootMargin="-50px"
              delay={isMobile ? 0 : 400}
              variant="fade-in-up-30"
            >
              <div className={cn(
                "absolute rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg shadow-primary/20",
                isMobile ? "-top-4 -left-4 w-8 h-8 text-sm" : "-top-5 -left-5 w-10 h-10 text-lg"
              )}>
                <motion.span
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, delay: 0.6 }}
                >
                  3
                </motion.span>
              </div>
              <motion.div
                className="absolute -z-10 inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0"
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              <h3 className={cn(
                "font-bold text-foreground",
                isMobile ? "text-lg mb-3 mt-1" : "text-xl mb-4 mt-2"
              )}>Borrow Assets</h3>
              <p className={cn(
                "text-muted-foreground mb-4",
                isMobile ? "text-sm" : "text-base"
              )}>
                Borrow up to your allowed limit based on the value of your collateral.
              </p>
              <ul className={cn(
                "space-y-2 text-muted-foreground",
                isMobile ? "text-xs" : "text-sm"
              )}>
                <FadeInOnScroll
                  as="li"
                  className="flex items-start"
                  threshold={0.1}
                  rootMargin="-50px"
                  delay={isMobile ? 0 : 500}
                  variant="fade-in-left"
                >
                  <div className={cn(
                    "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                    isMobile ? "mt-0.5" : ""
                  )}>
                    <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                  </div>
                  <span>Borrow up to your allowed limit based on collateral value</span>
                </FadeInOnScroll>
                <FadeInOnScroll
                  as="li"
                  className="flex items-start"
                  threshold={0.1}
                  rootMargin="-50px"
                  delay={isMobile ? 0 : 600}
                  variant="fade-in-left"
                >
                  <div className={cn(
                    "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                    isMobile ? "mt-0.5" : ""
                  )}>
                    <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                  </div>
                  <span>The interest rate you pay changes automatically with market demand</span>
                </FadeInOnScroll>
                <FadeInOnScroll
                  as="li"
                  className="flex items-start"
                  threshold={0.1}
                  rootMargin="-50px"
                  delay={isMobile ? 0 : 700}
                  variant="fade-in-left"
                >
                  <div className={cn(
                    "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                    isMobile ? "mt-0.5" : ""
                  )}>
                    <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                  </div>
                  <span>You can repay your loan at any time, including the accrued interest</span>
                </FadeInOnScroll>
              </ul>
            </FadeInOnScroll>
          </div>

          <FadeInOnScroll
            className="text-center mt-8 md:mt-12 relative z-10"
            threshold={0.1}
            rootMargin="-50px"
            delay={600}
          >
            <MagneticButton>
              <Button
                asChild
                size={isMobile ? "default" : "lg"}
                className="bg-primary text-primary-foreground hover:bg-primary-foreground hover:text-primary border border-primary/20 hover:border-primary/40 rounded-xl group relative overflow-hidden font-semibold px-6 py-3 transition-all duration-300 shadow-lg shadow-primary/20"
              >
                <Link href="/how-it-works" className="flex items-center">
                  Learn More
                  <motion.div
                    className="ml-2"
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </motion.div>
                </Link>
              </Button>
            </MagneticButton>
          </FadeInOnScroll>
        </div>
      </div>
    </section>
  )
}

export default HowItWorksSection; 