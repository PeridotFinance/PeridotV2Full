"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { useReducedMotion } from "@/lib/use-reduced-motion" // Assuming this is needed for FloatingElement
import { cn } from "@/lib/utils" // Assuming this is needed

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
  return (
    <section className="py-20 bg-muted relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <FloatingElement xOffset={50} yOffset={-50} duration={6}>
          <div className="w-[400px] h-[400px] rounded-full bg-primary/5 blur-3xl absolute right-0 top-0" />
        </FloatingElement>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
        >
          <motion.h2
            className="text-3xl font-bold mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            How <span className="gradient-text">Peridot</span> Works
          </motion.h2>
          <motion.p
            className="text-text/70"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Our platform creates efficient money markets for crypto assets with algorithmically determined interest
            rates.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div
            className="bg-card border border-border/50 rounded-xl p-6 relative"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            whileHover={{ y: -5 }}
          >
            <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-background font-bold text-xl shadow-lg">
              <motion.span
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
              >
                1
              </motion.span>
            </div>
            <motion.div
              className="absolute -z-10 inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-xl opacity-0"
              whileHover={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            />
            <h3 className="text-xl font-bold mb-4 mt-2">Supply Assets</h3>
            <p className="text-text/70 mb-4">Deposit your crypto to start earning interest.</p>
            <ul className="space-y-3 text-sm text-text/70">
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <div className="mr-2 mt-1 bg-primary/20 p-1 rounded-full">
                  <ArrowRight className="h-3 w-3 text-primary" />
                </div>
                <span>Receive tokens (cTokens) that show your deposit</span>
              </motion.li>
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <div className="mr-2 mt-1 bg-primary/20 p-1 rounded-full">
                  <ArrowRight className="h-3 w-3 text-primary" />
                </div>
                <span>Your balance automatically grows with interest</span>
              </motion.li>
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                <div className="mr-2 mt-1 bg-primary/20 p-1 rounded-full">
                  <ArrowRight className="h-3 w-3 text-primary" />
                </div>
                <span>Withdraw your crypto whenever you want—no waiting period</span>
              </motion.li>
            </ul>
          </motion.div>

          <motion.div
            className="bg-card border border-border/50 rounded-xl p-6 relative"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: 0.2 }}
            whileHover={{ y: -5 }}
          >
            <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-background font-bold text-xl shadow-lg">
              <motion.span
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, delay: 0.3 }}
              >
                2
              </motion.span>
            </div>
            <motion.div
              className="absolute -z-10 inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-xl opacity-0"
              whileHover={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            />
            <h3 className="text-xl font-bold mb-4 mt-2">Collateralize</h3>
            <p className="text-text/70 mb-4">
              Your deposited crypto acts as collateral, letting you borrow other assets.
            </p>
            <ul className="space-y-3 text-sm text-text/70">
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.3 }}
              >
                <div className="mr-2 mt-1 bg-primary/20 p-1 rounded-full">
                  <ArrowRight className="h-3 w-3 text-primary" />
                </div>
                <span>Each asset has a limit on how much you can borrow</span>
              </motion.li>
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.4 }}
              >
                <div className="mr-2 mt-1 bg-primary/20 p-1 rounded-full">
                  <ArrowRight className="h-3 w-3 text-primary" />
                </div>
                <span>Keep a healthy balance so you don't risk liquidation</span>
              </motion.li>
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.5 }}
              >
                <div className="mr-2 mt-1 bg-primary/20 p-1 rounded-full">
                  <ArrowRight className="h-3 w-3 text-primary" />
                </div>
                <span>Supports collateral from different blockchains for extra flexibility</span>
              </motion.li>
            </ul>
          </motion.div>

          <motion.div
            className="bg-card border border-border/50 rounded-xl p-6 relative"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: 0.4 }}
            whileHover={{ y: -5 }}
          >
            <div className="absolute -top-6 -left-6 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-background font-bold text-xl shadow-lg">
              <motion.span
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, delay: 0.6 }}
              >
                3
              </motion.span>
            </div>
            <motion.div
              className="absolute -z-10 inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-xl opacity-0"
              whileHover={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            />
            <h3 className="text-xl font-bold mb-4 mt-2">Borrow Assets</h3>
            <p className="text-text/70 mb-4">
              Borrow up to your allowed limit based on the value of your collateral.
            </p>
            <ul className="space-y-3 text-sm text-text/70">
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.5 }}
              >
                <div className="mr-2 mt-1 bg-primary/20 p-1 rounded-full">
                  <ArrowRight className="h-3 w-3 text-primary" />
                </div>
                <span>Borrow up to your allowed limit based on collateral value</span>
              </motion.li>
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.6 }}
              >
                <div className="mr-2 mt-1 bg-primary/20 p-1 rounded-full">
                  <ArrowRight className="h-3 w-3 text-primary" />
                </div>
                <span>The interest rate you pay changes automatically with market demand</span>
              </motion.li>
              <motion.li
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.7 }}
              >
                <div className="mr-2 mt-1 bg-primary/20 p-1 rounded-full">
                  <ArrowRight className="h-3 w-3 text-primary" />
                </div>
                <span>You can repay your loan at any time, including the accrued interest</span>
              </motion.li>
            </ul>
          </motion.div>
        </div>

        <motion.div
          className="text-center mt-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <MagneticButton>
            <Button
              asChild
              size="lg"
              className="bg-primary text-background hover:bg-primary/90 rounded-xl group relative overflow-hidden"
            >
              <Link href="/how-it-works" className="flex items-center">
                Learn More About Our Protocol
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