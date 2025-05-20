"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useMobile } from "@/hooks/use-mobile"
import { useReducedMotion } from "@/lib/use-reduced-motion"
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

// Re-define or import InteractiveCard, FeatureCard, FloatingElement if they are used within this section
// For now, assuming FeatureCard and FloatingElement are self-contained or passed as props if needed.

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

  if (isLowPerfDevice) {
    return (
      <div className="bg-card border-border/50 h-full group rounded-xl p-6">
        <div className="relative mb-4">
          <div className="relative z-10 h-12 w-12 text-primary flex items-center justify-center">
            <Icon className="h-8 w-8" />
          </div>
        </div>
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        <p className="text-text/70">{description}</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5, delay }}
    >
      <InteractiveCard className="bg-card border-border/50 h-full group">
        <CardHeader>
          <div className="relative mb-4">
            <motion.div
              className="absolute inset-0 bg-primary/20 rounded-full blur-xl"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 3,
                repeat: Number.POSITIVE_INFINITY,
                repeatType: "reverse",
              }}
            />
            <motion.div
              className="relative z-10 h-12 w-12 text-primary flex items-center justify-center"
              whileHover={{ rotate: 5, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <Icon className="h-8 w-8" />
            </motion.div>
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription className="text-text/70">{description}</CardDescription>
        </CardHeader>
      </InteractiveCard>
    </motion.div>
  )
}

// FloatingElement (assuming props are passed or it's self-contained)
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


export const FeaturesSection = () => {
  return (
    <section className="py-20 bg-background relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <FloatingElement xOffset={-100} yOffset={100} duration={7}>
          <div className="w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl absolute -left-64 top-1/4" />
        </FloatingElement>
        <FloatingElement xOffset={100} yOffset={-50} duration={8}>
          <div className="w-[600px] h-[600px] rounded-full bg-accent/5 blur-3xl absolute -right-96 bottom-0" />
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
            Why Choose <span className="gradient-text">Peridot</span>?
          </motion.h2>
          <motion.p
            className="text-text/70"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Our platform offers unique advantages for both lenders and borrowers in the DeFi ecosystem.
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <FeatureCard
            icon={Coins}
            title="Get Liquidity Without Selling"
            description="Borrow cash or stablecoins while still holding your crypto."
            delay={0.1}
          />
          <FeatureCard
            icon={ArrowUpDown}
            title="Earn Interest on Idle Assets"
            description="Put your crypto to work and earn money on assets you're just holding."
            delay={0.2}
          />
          <FeatureCard
            icon={Lock}
            title="Trustless and Transparent"
            description="No middleman; everything runs on smart contracts you can check on-chain."
            delay={0.3}
          />
          <FeatureCard
            icon={BarChart3}
            title="Instant Access to Funds"
            description="Quickly get the cash you need without long waits or paperwork."
            delay={0.4}
          />
          <FeatureCard
            icon={Shield}
            title="Market-Driven Rates"
            description="Interest rates adjust automatically based on demand, keeping things fair."
            delay={0.5}
          />
          <FeatureCard
            icon={Wallet}
            title="Secure Borrowing"
            description="Your loans are backed by collateral, reducing risk for both you and the system."
            delay={0.6}
          />
          <FeatureCard
            icon={Globe}
            title="Open Ecosystem"
            description="Anyone can join without permission, and the platform works well with other dApps."
            delay={0.7}
          />
          <FeatureCard
            icon={Users}
            title="Community Governance"
            description="Over time, you can help decide how the platform evolves through decentralized governance."
            delay={0.8}
          />
        </div>
      </div>
    </section>
  )
}

export default FeaturesSection; 