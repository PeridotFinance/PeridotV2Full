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

  if (isLowPerfDevice) {
    return (
      <div className={cn(
        "bg-card border border-border/50 h-full group rounded-lg transition-shadow hover:shadow-lg",
        isMobile ? "p-4 flex items-start gap-3" : "p-6"
      )}>
        <div className={cn(
          "relative flex-shrink-0",
          isMobile ? "mb-0" : "mb-4"
        )}>
          <div className={cn(
            "relative z-10 text-primary flex items-center justify-center bg-primary/10 rounded-lg",
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: isMobile ? 0 : delay }}
      className="h-full"
    >
      <InteractiveCard className={cn(
        "bg-card border border-border/50 h-full group rounded-lg hover:shadow-lg transition-all duration-300",
        isMobile ? "flex items-start gap-3" : ""
      )}>
        <CardHeader className={cn(
          isMobile ? "p-4 flex-row items-start gap-3 space-y-0" : "p-6"
        )}>
          <div className={cn(
            "relative flex-shrink-0",
            isMobile ? "mb-0" : "mb-4"
          )}>
            <motion.div
              className={cn(
                "absolute inset-0 bg-primary/20 rounded-lg blur-sm",
                isMobile ? "opacity-50" : ""
              )}
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Number.POSITIVE_INFINITY,
                repeatType: "reverse",
              }}
            />
            <motion.div
              className={cn(
                "relative z-10 text-primary flex items-center justify-center bg-primary/10 rounded-lg",
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
  const isMobile = useMobile()
  
  return (
    <section className="py-16 md:py-20 bg-background relative overflow-hidden">
      {/* Simplified background elements for better performance */}
      <div className="absolute inset-0 pointer-events-none opacity-60">
        <FloatingElement xOffset={-100} yOffset={100} duration={7}>
          <div className="w-[300px] h-[300px] md:w-[500px] md:h-[500px] rounded-full bg-primary/5 blur-3xl absolute -left-32 md:-left-64 top-1/4" />
        </FloatingElement>
        <FloatingElement xOffset={100} yOffset={-50} duration={8}>
          <div className="w-[400px] h-[400px] md:w-[600px] md:h-[600px] rounded-full bg-accent/5 blur-3xl absolute -right-48 md:-right-96 bottom-0" />
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
            Why Choose <span className="gradient-text">Peridot</span>?
          </motion.h2>
          <motion.p
            className="text-base md:text-lg text-muted-foreground leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Experience the future of DeFi lending with our secure, transparent, and user-friendly platform designed for both newcomers and experts.
          </motion.p>
        </motion.div>

        {/* Optimized grid for mobile: 1 column on mobile, 2 on tablet, 4 on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
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
        <motion.div
          className="text-center mt-12 md:mt-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <Link href="/app" passHref>
            <Button 
              size={isMobile ? "default" : "lg"} 
              className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-semibold px-8 py-3 rounded-lg"
            >
              Start Earning Today
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

export default FeaturesSection; 