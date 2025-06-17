"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { useReducedMotion } from "@/lib/use-reduced-motion"
import { useMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

// MagneticButton (simplified, assuming defined elsewhere or props passed)
const MagneticButton = ({ children, className = "", ...props }: { children: React.ReactNode; className?: string; [key: string]: any; }) => {
  return <div className={cn("relative", className)} {...props}>{children}</div>;
};

// FloatingElement (simplified, assuming defined elsewhere or props passed)
interface FloatingElementProps {
  children: React.ReactNode;
  xOffset?: number;
  yOffset?: number;
  duration?: number;
}

const FloatingElement = ({ children, xOffset = 0, yOffset = 0, duration = 3 }: FloatingElementProps) => {
  const { isLowPerfDevice } = useReducedMotion();

  if (isLowPerfDevice) {
    return <div style={{ transform: `translate(${xOffset}px, ${yOffset}px)` }}>{children}</div>;
  }

  return (
    <motion.div
      animate={{
        y: [yOffset, yOffset - 15, yOffset],
        x: [xOffset, xOffset + 5, xOffset],
        rotate: [0, 2, 0],
      }}
      transition={{
        duration,
        repeat: Number.POSITIVE_INFINITY,
        repeatType: "reverse",
        ease: "easeInOut",
      }}
    >
      {children}
    </motion.div>
  );
};

export const HowItWorksSection = () => {
  const isMobile = useMobile()
  
  return (
    <section className="py-16 md:py-20 bg-muted relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <FloatingElement xOffset={50} yOffset={-50} duration={6}>
          <div className="w-[300px] h-[300px] md:w-[400px] md:h-[400px] rounded-full bg-primary/5 blur-3xl absolute right-0 top-0" />
        </FloatingElement>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-12 md:mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6 }}
        >
          <motion.h2
            className="text-2xl md:text-3xl font-bold mb-4 text-foreground"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            How <span className="gradient-text">Peridot</span> Works
          </motion.h2>
          <motion.p
            className="text-base md:text-lg text-muted-foreground leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Our platform creates efficient money markets for crypto assets with algorithmically determined interest rates.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          <motion.div
            className={cn(
              "bg-card border border-border/50 rounded-lg relative hover:shadow-lg transition-all duration-300",
              isMobile ? "p-4" : "p-6"
            )}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6 }}
            whileHover={{ y: -2 }}
          >
            <div className={cn(
              "absolute rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg",
              isMobile ? "-top-4 -left-4 w-8 h-8 text-sm" : "-top-6 -left-6 w-12 h-12 text-xl"
            )}>
              <motion.span
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
              >
                1
              </motion.span>
            </div>
            <motion.div
              className="absolute -z-10 inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-lg opacity-0"
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
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: isMobile ? 0 : 0.1 }}
              >
                <div className={cn(
                  "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                  isMobile ? "mt-0.5" : ""
                )}>
                  <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                </div>
                <span>Receive tokens (pTokens) that show your deposit</span>
              </motion.li>
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: isMobile ? 0 : 0.2 }}
              >
                <div className={cn(
                  "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                  isMobile ? "mt-0.5" : ""
                )}>
                  <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                </div>
                <span>Your balance automatically grows with interest</span>
              </motion.li>
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: isMobile ? 0 : 0.3 }}
              >
                <div className={cn(
                  "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                  isMobile ? "mt-0.5" : ""
                )}>
                  <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                </div>
                <span>Withdraw your crypto whenever you want—no waiting period</span>
              </motion.li>
            </ul>
          </motion.div>

          <motion.div
            className={cn(
              "bg-card border border-border/50 rounded-lg relative hover:shadow-lg transition-all duration-300",
              isMobile ? "p-4" : "p-6"
            )}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: isMobile ? 0 : 0.2 }}
            whileHover={{ y: -2 }}
          >
            <div className={cn(
              "absolute rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg",
              isMobile ? "-top-4 -left-4 w-8 h-8 text-sm" : "-top-6 -left-6 w-12 h-12 text-xl"
            )}>
              <motion.span
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, delay: 0.3 }}
              >
                2
              </motion.span>
            </div>
            <motion.div
              className="absolute -z-10 inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-lg opacity-0"
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
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: isMobile ? 0 : 0.3 }}
              >
                <div className={cn(
                  "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                  isMobile ? "mt-0.5" : ""
                )}>
                  <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                </div>
                <span>Each asset has a limit on how much you can borrow</span>
              </motion.li>
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: isMobile ? 0 : 0.4 }}
              >
                <div className={cn(
                  "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                  isMobile ? "mt-0.5" : ""
                )}>
                  <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                </div>
                <span>Keep a healthy balance so you don't risk liquidation</span>
              </motion.li>
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: isMobile ? 0 : 0.5 }}
              >
                <div className={cn(
                  "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                  isMobile ? "mt-0.5" : ""
                )}>
                  <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                </div>
                <span>Supports collateral from different blockchains for extra flexibility</span>
              </motion.li>
            </ul>
          </motion.div>

          <motion.div
            className={cn(
              "bg-card border border-border/50 rounded-lg relative hover:shadow-lg transition-all duration-300",
              isMobile ? "p-4" : "p-6"
            )}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.6, delay: isMobile ? 0 : 0.4 }}
            whileHover={{ y: -2 }}
          >
            <div className={cn(
              "absolute rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-lg",
              isMobile ? "-top-4 -left-4 w-8 h-8 text-sm" : "-top-6 -left-6 w-12 h-12 text-xl"
            )}>
              <motion.span
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, delay: 0.6 }}
              >
                3
              </motion.span>
            </div>
            <motion.div
              className="absolute -z-10 inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-lg opacity-0"
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
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: isMobile ? 0 : 0.5 }}
              >
                <div className={cn(
                  "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                  isMobile ? "mt-0.5" : ""
                )}>
                  <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                </div>
                <span>Borrow up to your allowed limit based on collateral value</span>
              </motion.li>
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: isMobile ? 0 : 0.6 }}
              >
                <div className={cn(
                  "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                  isMobile ? "mt-0.5" : ""
                )}>
                  <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                </div>
                <span>The interest rate you pay changes automatically with market demand</span>
              </motion.li>
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: isMobile ? 0 : 0.7 }}
              >
                <div className={cn(
                  "mr-2 mt-1 bg-primary/20 p-1 rounded-full flex-shrink-0",
                  isMobile ? "mt-0.5" : ""
                )}>
                  <ArrowRight className={cn("text-primary", isMobile ? "h-2 w-2" : "h-3 w-3")} />
                </div>
                <span>You can repay your loan at any time, including the accrued interest</span>
              </motion.li>
            </ul>
          </motion.div>
        </div>

        <motion.div
          className="text-center mt-8 md:mt-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <MagneticButton>
            <Button
              asChild
              size={isMobile ? "default" : "lg"}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg group relative overflow-hidden font-semibold px-6 py-3"
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
        </motion.div>
      </div>
    </section>
  )
}

export default HowItWorksSection; 