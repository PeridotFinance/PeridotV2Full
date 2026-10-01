"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, useScroll, useTransform, useMotionValue, useSpring } from "framer-motion"
import { Button } from "@/components/ui/button"
import { useMobile } from "@/hooks/use-mobile"
import { useReducedMotion } from "@/lib/use-reduced-motion"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  Coins,
  Globe,
  Users,
} from "lucide-react"
import { useTheme } from "next-themes"
import { CookieConsentBanner } from "@/components/CookieConsentBanner"

import { HeroLiveRates } from "@/components/landing/HeroLiveRates"
import { trackCta } from "@/lib/analytics/cta"
import { FeaturesSection } from "@/components/landing/FeaturesSection"
import { HowItWorksSection } from "@/components/landing/HowItWorksSection"
import { TrustAndSecuritySection } from "@/components/landing/TrustAndSecuritySection"
import { AwardsSection } from "@/components/landing/AwardsSection"
import { CTASection } from "@/components/landing/CTASection"
import { PartnersSection } from "@/components/landing/PartnersSection"
import { CubeAnimation } from "@/components/landing/CubeAnimation"
import { FloatingElement } from "@/components/shared/FloatingElement"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import StructuredData from "@/components/StructuredData"


// Optimized parallax text effect
const ParallaxText = ({ 
  children, 
  baseVelocity = 100 
}: { 
  children: React.ReactNode; 
  baseVelocity?: number;
}) => {
  const { isLowPerfDevice } = useReducedMotion()
  const baseX = useMotionValue(0)
  const { scrollY } = useScroll()
  const scrollVelocity = useTransform(scrollY, [0, 1000], [0, 5])
  const smoothVelocity = useSpring(scrollVelocity, {
    damping: 50,
    stiffness: 400,
  })
  const velocity = useTransform(smoothVelocity, [0, 1], [0, baseVelocity])
  const direction = baseVelocity < 0 ? -1 : 1

  // For low performance devices, use a simpler animation with CSS
  if (isLowPerfDevice) {
    const animationClass = direction < 0 ? "animate-marquee" : "animate-marquee-reverse"
    return (
      <div className="flex overflow-hidden whitespace-nowrap">
        <div className={`flex whitespace-nowrap ${animationClass}`}>
          <span className="block mr-12">{children}</span>
          <span className="block mr-12">{children}</span>
          <span className="block mr-12">{children}</span>
          <span className="block mr-12">{children}</span>
          <span className="block mr-12">{children}</span>
          <span className="block mr-12">{children}</span>
        </div>
      </div>
    )
  }

  // Create a more robust animation with Framer Motion
  const [contentWidth, setContentWidth] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (containerRef.current) {
      // Measure the width of one copy of the content
      const firstChild = containerRef.current.firstChild as HTMLElement
      if (firstChild) {
        setContentWidth(firstChild.offsetWidth)
      }
    }
  }, [children])

  useEffect(() => {
    let prevT = 0
    let ticker: number | null = null

    // Initialize starting point based on direction
    if (direction > 0) {
      // For right-to-left scrolling, start from negative width
      baseX.set(-contentWidth)
    }

    const tick = (t: number) => {
      if (prevT) {
        const delta = (t - prevT) / 1000
        let newX = baseX.get() + delta * velocity.get()
        
        // Reset position when we've scrolled past the viewable area
        if (contentWidth > 0) {
          if (direction < 0) {
            // For left-to-right scrolling (negative velocity)
            // When we've gone too far left, reset
            if (newX <= -contentWidth) {
              newX = 0
            }
          } else {
            // For right-to-left scrolling (positive velocity)
            // When we've gone too far right (back to 0), reset to negative width
            if (newX >= 0) {
              newX = -contentWidth
            }
          }
        }
        
        baseX.set(newX)
      }
      prevT = t
      ticker = requestAnimationFrame(tick)
    }

    ticker = requestAnimationFrame(tick)

    return () => {
      if (ticker) cancelAnimationFrame(ticker)
    }
  }, [baseX, velocity, contentWidth, direction])

  return (
    <div className="flex overflow-hidden whitespace-nowrap">
      <motion.div 
        ref={containerRef}
        className="flex whitespace-nowrap" 
        style={{ x: baseX }}
      >
        <span className="block mr-12">{children}</span>
        <span className="block mr-12">{children}</span>
        <span className="block mr-12">{children}</span>
        <span className="block mr-12">{children}</span>
        <span className="block mr-12">{children}</span>
        <span className="block mr-12">{children}</span>
        <span className="block mr-12">{children}</span>
        <span className="block mr-12">{children}</span>
      </motion.div>
    </div>
  )
}

// Optimized 3D isomorphic text component
const IsomorphicText = ({ 
  text, 
  className 
}: { 
  text: string; 
  className?: string; 
}) => {
  const { isLowPerfDevice } = useReducedMotion()
  const isMobile = useMobile()

  // For low performance devices, render static text
  if (isLowPerfDevice) {
    return <div className={cn("relative", className)}>{text}</div>
  }

  const letters = text.split("")

  // CSS animation instead of Framer Motion: the resting state is the *base*
  // style, so if the animation never runs (backgrounded tab on load, bfcache
  // restore, reduced motion) the headline is still readable instead of stuck
  // at its invisible start frame.
  return (
    <div className={cn("relative", className)}>
      {letters.map((letter: string, index: number) => (
        <span
          key={index}
          className="iso-letter"
          style={{
            animationDelay: `${0.05 * index}s`,
            textShadow: !isMobile ? `0px 10px 20px rgba(0, 0, 0, 0.2)` : "none",
          }}
        >
          {letter === " " ? "\u00A0" : letter}
        </span>
      ))}
    </div>
  )
}

// Simplified magnetic button effect
interface MagneticButtonProps {
  children: React.ReactNode;
  className?: string;
  [key: string]: any;
}

const MagneticButton = ({ children, className = "", ...props }: MagneticButtonProps) => {
  const { isLowPerfDevice } = useReducedMotion()

  // Skip animation on low performance devices only
  if (isLowPerfDevice) {
    return (
      <div className={cn("relative", className)} {...props}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={cn("relative", className)}
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.2 }}
      {...props}
    >
      {children}
      <motion.div
        className="absolute -inset-2 pointer-events-none"
        style={{
          background: `radial-gradient(circle, hsl(var(--primary) / 0.08) 0%, hsl(var(--primary) / 0) 60%)`,
          borderRadius: "50%",
          opacity: 0,
        }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      />
    </motion.div>
  )
}

// Optimized feature card
interface FeatureCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  delay?: number;
}


// Optimized scroll indicator
const ScrollIndicator = () => {
  const { isLowPerfDevice } = useReducedMotion()

  // Skip on low performance devices
  if (isLowPerfDevice) return null

  return (
    <motion.div
      className="flex flex-col items-center mt-12 mb-4"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2, duration: 0.5 }}
    >
      <span className="text-sm text-text/60 mb-2">Scroll to explore</span>
      <motion.div className="w-6 h-10 border-2 border-text/30 rounded-full flex justify-center p-1" initial={{ y: 0 }}>
        <motion.div
          className="w-1.5 h-1.5 bg-primary rounded-full"
          animate={{
            y: [0, 12, 0],
          }}
          transition={{
            duration: 1.5,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "loop",
            ease: "easeInOut",
          }}
        />
      </motion.div>
    </motion.div>
  )
}


// Optimized animated value visualization component
interface AnimatedValueVisualizationProps {
  value: string;
  icon: string;
  description: string;
}

const AnimatedValueVisualization = ({ value, icon, description }: AnimatedValueVisualizationProps) => {
  const [isHovered, setIsHovered] = useState(false)
  const isMobile = useMobile()
  const { isLowPerfDevice } = useReducedMotion()

  // Simplified version for low performance devices
  if (isLowPerfDevice) {
    return (
      <div className="flex flex-col">
        <div className="text-2xl md:text-3xl font-bold mb-2">{value}</div>
        <div className="h-16 md:h-20 w-full bg-primary/10 rounded-md"></div>
        <div className="text-xs text-text/60 mt-2">{description}</div>
      </div>
    )
  }

  // Animation variants
  const containerVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { staggerChildren: 0.1 } },
    hover: { scale: 1.02 },
  }

  // Generate the appropriate visualization based on the icon type
  const renderVisualization = () => {
    switch (icon) {
      case "tvl":
        return (
          <motion.div
            className="relative h-16 md:h-20 w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div className="absolute inset-0 flex items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="h-full flex-1 mx-0.5 rounded-t-md bg-primary/20"
                  initial={{ height: 0 }}
                  animate={{
                    height: [`${Math.random() * 40 + 20}%`, `${Math.random() * 40 + 40}%`],
                    backgroundColor: isHovered ? "hsl(var(--primary) / 0.4)" : "hsl(var(--primary) / 0.2)",
                  }}
                  transition={{
                    duration: 2,
                    repeat: Number.POSITIVE_INFINITY,
                    repeatType: "reverse",
                    delay: i * 0.1,
                  }}
                />
              ))}
            </motion.div>
            <motion.div
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/50"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1, delay: 0.5 }}
            />
          </motion.div>
        )

      case "users":
        return (
          <motion.div
            className="relative h-16 md:h-20 w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full bg-primary/30"
                    style={{
                      width: isMobile ? 40 - i * 10 : 60 - i * 15,
                      height: isMobile ? 40 - i * 10 : 60 - i * 15,
                      top: isMobile ? i * 5 : i * 7.5,
                      left: isMobile ? i * 5 : i * 7.5,
                    }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: 1,
                      opacity: 1 - i * 0.2,
                    }}
                    transition={{
                      duration: 1,
                      delay: 0.3 + i * 0.2,
                    }}
                  />
                ))}
                <motion.div
                  className="relative z-10 rounded-full bg-primary flex items-center justify-center text-background"
                  style={{
                    width: isMobile ? 40 : 60,
                    height: isMobile ? 40 : 60,
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 15,
                    delay: 0.6,
                  }}
                >
                  <Users className={`${isMobile ? "h-5 w-5" : "h-7 w-7"}`} />
                </motion.div>
              </div>
            </div>
          </motion.div>
        )

      case "chains":
        return (
          <motion.div
            className="relative h-16 md:h-20 w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-full h-full flex items-center justify-center">
                {[...Array(8)].map((_, i) => {
                  const angle = (i / 8) * Math.PI * 2
                  const radius = isMobile ? 25 : 40
                  const x = Math.cos(angle) * radius
                  const y = Math.sin(angle) * radius

                  return (
                    <motion.div
                      key={i}
                      className="absolute w-2.5 h-2.5 rounded-full bg-primary/80"
                      style={{
                        x: x,
                        y: y,
                      }}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{
                        scale: 1,
                        opacity: 1,
                      }}
                      transition={{
                        duration: 0.3,
                        delay: 0.5 + i * 0.1,
                      }}
                    />
                  )
                })}

                <motion.div
                  className="relative z-10 rounded-full bg-primary/20 flex items-center justify-center"
                  style={{
                    width: isMobile ? 40 : 50,
                    height: isMobile ? 40 : 50,
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 15,
                    delay: 0.3,
                  }}
                >
                  <Globe className={`${isMobile ? "h-5 w-5" : "h-6 w-6"} text-primary`} />
                </motion.div>

                {/* Connection lines */}
                <svg className="absolute inset-0 w-full h-full" style={{ overflow: "visible" }}>
                  {[...Array(8)].map((_, i) => {
                    const angle = (i / 8) * Math.PI * 2
                    const radius = isMobile ? 25 : 40
                    const x = Math.cos(angle) * radius
                    const y = Math.sin(angle) * radius

                    return (
                      <motion.line
                        key={i}
                        x1="0"
                        y1="0"
                        x2={x}
                        y2={y}
                        stroke="hsl(var(--primary) / 0.3)"
                        strokeWidth="1"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{
                          pathLength: 1,
                          opacity: isHovered ? 0.6 : 0.3,
                        }}
                        transition={{
                          duration: 0.8,
                          delay: 0.7 + i * 0.1,
                        }}
                      />
                    )
                  })}
                </svg>
              </div>
            </div>
          </motion.div>
        )

      case "interest":
        return (
          <motion.div
            className="relative h-16 md:h-20 w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="relative"
                animate={{
                  rotate: isHovered ? 360 : 0,
                }}
                transition={{
                  duration: isHovered ? 20 : 0,
                  ease: "linear",
                  repeat: Number.POSITIVE_INFINITY,
                }}
              >
                {[...Array(12)].map((_, i) => {
                  const angle = (i / 12) * Math.PI * 2
                  const radius = isMobile ? 25 : 35
                  const size = isMobile ? 2 + (i % 3 === 0 ? 1 : 0) : 3 + (i % 3 === 0 ? 1.5 : 0)

                  return (
                    <motion.div
                      key={i}
                      className="absolute rounded-full bg-primary"
                      style={{
                        width: size,
                        height: size,
                        x: Math.cos(angle) * radius - size / 2,
                        y: Math.sin(angle) * radius - size / 2,
                      }}
                      initial={{ opacity: 0 }}
                      animate={{
                        opacity: 0.2 + (i % 3 === 0 ? 0.6 : 0.3),
                      }}
                      transition={{
                        duration: 0.3,
                        delay: 0.5 + i * 0.05,
                      }}
                    />
                  )
                })}

                <motion.div
                  className="relative rounded-full bg-primary/10 flex items-center justify-center"
                  style={{
                    width: isMobile ? 40 : 50,
                    height: isMobile ? 40 : 50,
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 15,
                    delay: 0.3,
                  }}
                >
                  <Coins className={`${isMobile ? "h-5 w-5" : "h-6 w-6"} text-primary`} />
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        )

      default:
        return null
    }
  }

  return (
    <motion.div
      className="flex flex-col"
      variants={containerVariants}
      initial="initial"
      animate="animate"
      whileHover="hover"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <div className="flex items-center justify-between mb-2">
        <motion.div
          className="text-2xl md:text-3xl font-bold"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {value}
        </motion.div>
      </div>

      {renderVisualization()}

      <motion.div
        className="text-xs text-text/60 mt-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {description}
      </motion.div>
    </motion.div>
  )
}

// Optimized donut chart
interface DonutChartProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}

const DonutChart = ({ value, max = 100, size = 120, strokeWidth = 10, color = "var(--primary)" }: DonutChartProps) => {
  const { isLowPerfDevice } = useReducedMotion()
  const percentage = (value / max) * 100
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const [displayPercentage, setDisplayPercentage] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false) 

  // Use a ref to track the animation frame ID
  const animationFrameIdRef = useRef<number | null>(null)

  useEffect(() => {
    // Skip animation on low performance devices
    if (isLowPerfDevice) {
      setDisplayPercentage(Math.round(percentage))
      return
    }

    // Animate percentage counter
    const start = 0
    const duration = 1500
    const startTime = Date.now()

    const animateCount = () => {
      const now = Date.now()
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)

      const currentPercentage = Math.round(progress * percentage)
      setDisplayPercentage(currentPercentage)

      if (progress < 1) {
        animationFrameIdRef.current = requestAnimationFrame(animateCount)
      } else {
        setIsAnimating(false)
      }
    }

    setIsAnimating(true) // Start animation
    animationFrameIdRef.current = requestAnimationFrame(animateCount)

    return () => {
      setIsAnimating(false) // Stop animation on unmount
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current) // Cancel the animation frame
      }
    }
  }, [percentage, isLowPerfDevice])

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={strokeWidth}
        />

        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: isLowPerfDevice ? strokeDashoffset : circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: isLowPerfDevice ? 0 : 1.5, ease: "easeInOut" }}
          strokeLinecap="round"
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold">{displayPercentage}%</span>
      </div>
    </div>
  )
}

// Token component with optimized hover effect
interface TokenIconProps {
  name: string;
  image: string;
}

const TokenIcon = ({ name, image }: TokenIconProps) => {
  const { isLowPerfDevice } = useReducedMotion()

  if (isLowPerfDevice) {
    return (
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center p-1 shadow-sm">
          <Image src={image || "/placeholder.svg"} width={24} height={24} alt={name} className="object-contain" />
        </div>
        <span className="text-sm font-medium">{name}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center space-x-3">
      <motion.div
        className="w-8 h-8 rounded-full bg-card/80 backdrop-blur-sm flex items-center justify-center p-1 shadow-sm"
        whileHover={{ scale: 1.2, boxShadow: "0 0 8px hsl(var(--primary) / 0.6)" }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
      >
        <Image src={image || "/placeholder.svg"} width={24} height={24} alt={name} className="object-contain" />
      </motion.div>
      <span className="text-sm font-medium">{name}</span>
    </div>
  )
}


export default function Home() {
  const { resolvedTheme } = useTheme();
  const isMobile = useMobile();
  const { isLowPerfDevice, prefersReducedMotion } = useReducedMotion(); 
  const [showPopup, setShowPopup] = useState(false); 
  const heroRef = useRef(null)

  // Global error handler for unhandled errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('[LandingPage] Unhandled error:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
        stack: event.error?.stack,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        timestamp: new Date().toISOString(),
      })
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[LandingPage] Unhandled promise rejection:', {
        reason: event.reason,
        stack: event.reason?.stack,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        timestamp: new Date().toISOString(),
      })
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    // Log page load info
    console.log('[LandingPage] Page loaded', {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      viewport: {
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0,
      },
      hasIntersectionObserver: typeof window !== 'undefined' && typeof window.IntersectionObserver !== 'undefined',
      isLowPerfDevice,
      prefersReducedMotion,
    })

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [isLowPerfDevice, prefersReducedMotion])

  // Existing useEffect for popup
  useEffect(() => {
    const timer = setTimeout(() => setShowPopup(true), 15000);
    return () => clearTimeout(timer);
  }, []);



  // Memoize token data to prevent unnecessary re-renders
  const tokenRow1 = useMemo(
    () => [
      { name: "Ethereum", image: "/tokenimages/eth.png" },
      { name: "Stellar", image: "/tokenimages/stellar.png" },
      { name: "Polygon", image: "/tokenimages/matic.png" },
      { name: "Avalanche", image: "/tokenimages/avax.png" },
      { name: "Monad", image: "/tokenimages/app/Monad-Logo.svg" },
      { name: "Somnia", image: "/tokenimages/app/somnia_logo_color.jpg" },
      { name: "BNB Chain", image: "/tokenimages/app/bnb-logo.svg" },
      { name: "Arbitrum", image: "/tokenimages/arb.png" },
      { name: "Base", image: "/tokenimages/app/base-logo.svg" },
      { name: "Solana", image: "/tokenimages/sol.png" },
      { name: "Chainlink", image: "/tokenimages/link.png" },
      { name: "USDC", image: "/tokenimages/usdc.png" },
    ],
    [],
  )

  const tokenRow2 = useMemo(
    () => [
      { name: "Stellar", image: "/tokenimages/stellar.png" },
      { name: "Arbitrum", image: "/tokenimages/arb.png" },
      { name: "Cosmos", image: "/tokenimages/cosm.png" },
      { name: "USDC", image: "/tokenimages/usdc.png" },
      { name: "Dai", image: "/tokenimages/dai.png" },
      { name: "Aave", image: "/tokenimages/aave.png" },
    ],
    [],
  )




  return (
    <ErrorBoundary>
      <div className="flex flex-col min-h-screen">
        <StructuredData />
        {/* Cookie Consent Banner */}
        <CookieConsentBanner />

      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative pt-16 md:pt-20 pb-12 md:pb-20 overflow-hidden"
      >
        {/* Floating elements - CSS-based for better performance */}
        {!isLowPerfDevice && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <FloatingElement xOffset={100} yOffset={100} duration={4}>
              <div className="w-64 h-64 rounded-full bg-primary/5 blur-3xl absolute top-1/4 -left-32" />
            </FloatingElement>

            <FloatingElement xOffset={-50} yOffset={300} duration={5}>
              <div className="w-96 h-96 rounded-full bg-accent/5 blur-3xl absolute bottom-0 right-0" />
            </FloatingElement>

            <FloatingElement xOffset={0} yOffset={200} duration={6}>
              <div className="w-32 h-32 rounded-full bg-secondary/10 blur-xl absolute top-1/3 right-1/4" />
            </FloatingElement>
          </div>
        )}

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              {/* Category claim. Sits where the plain "Peridot Finance" kicker used
                  to be — the brand name is already in the header and the logo, so
                  this line carries the positioning instead of repeating it. */}
              <p className="animate-fade-in-up-delay-0">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1 text-sm font-medium tracking-wider text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  The first DeFi broker
                </span>
              </p>

              {/* 3D Isomorphic title - Fixed to prevent word breaks */}
              <h1 className="space-y-2 animate-fade-in-up-delay-0">
                {/* No `gradient-text` here: its background-clip:text layer paints a
                    second, green copy of the glyphs that can't follow the animated
                    letters — it showed up as a ghost behind the headline. The letters
                    carry their own color via `text-foreground`. */}
                <div className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight whitespace-nowrap">
                  <IsomorphicText text="NOW YOU CAN" className="text-foreground" />{" "}
                  {/* Changed from "Cross-Chain" to "Peridot" and fixed visibility */}
                </div>
                {/* One promise, not three. This line used to rotate through
                    "Grow Your Money." / "Earn without selling." / "Use crypto
                    like FIAT." on a 12-second loop, so the headline agreed with
                    the button underneath it roughly a third of the time. Borrowing
                    is also the claim no competitor on Stellar can make: Blend has
                    no consumer surface, and Beans is deposit-only by design. */}
                <div className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight whitespace-nowrap h-[1.2em] overflow-visible">
                  <span className="cyber-typewriter-solo" style={{ ["--tw-chars" as any]: "21ch" }}>
                    Earn without selling.
                  </span>
                </div>
              </h1>

              <p
                className="text-lg md:text-xl text-text/80 max-w-xl animate-fade-in-up-delay-400"
              >
                Borrow against the crypto you already hold instead of selling it — and keep earning on it while you do. No bank, no paperwork, and your assets never leave your hands.
              </p>

              <HeroLiveRates />

              <div
                className="flex flex-col sm:flex-row gap-4 animate-fade-in-up-delay-600"
              >
                <MagneticButton>
                  <Button
                    asChild
                    size="lg"
                    className="bg-primary text-primary-foreground hover:bg-primary-foreground hover:text-primary border border-primary/20 hover:border-primary/40 rounded-2xl group relative transition-all duration-300 button-slide-effect"
                  >
                    {/* "Launch App" named the software, not the thing the visitor
                        came for, and pointed at /app — the Earn surface — even
                        though the headline above it is about borrowing. This says
                        what happens next and lands on the matching screen. */}
                    <Link href="/app/borrow" className="flex items-center" onClick={() => trackCta("hero_primary", { to: "/app/borrow" })}>
                      <span className="relative z-10">See what you can borrow</span>
                      <div className="relative z-10 ml-2 animate-arrow-bounce">
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </Link>
                  </Button>
                </MagneticButton>

                <MagneticButton>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-primary/20 hover:border-primary/40 hover:bg-primary/5 text-primary hover:text-primary rounded-2xl group transition-all duration-300"
                  >
                    <Link href="/app" className="flex items-center" onClick={() => trackCta("hero_secondary", { to: "/app" })}>
                      Earn on savings
                      <div className="ml-2 animate-arrow-bounce-opacity">
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </Link>
                  </Button>
                </MagneticButton>
              </div>

              {/* The AI agent work is real and worth showing, but as a second
                  destination beside the primary one it competed for the click and
                  led out of the funnel entirely — /agents draws visitors and
                  converts almost none. It keeps a line, not a button. */}
              <p className="text-sm text-text/50 animate-fade-in-up-delay-600">
                Building with agents?{" "}
                <Link href="/agents" className="text-primary/80 underline underline-offset-2 hover:text-primary">
                  Peridot has an MCP server and an open toolkit
                </Link>
                .
              </p>
            </div>

          </div>

          {/* Cube Animation - Right Side */}
          {/* Temporarily hidden for now — $P glyph cube. */}
          {/* <CubeAnimation /> */}

          {!isLowPerfDevice && !isMobile && <ScrollIndicator />}
        </div>
      </section>

      {/* Partners marquee */}
      <PartnersSection />

      {/* Rest of the page content - optimized for performance */}
      {/* Features Section */}
      <FeaturesSection />

      {/* Animated marquee section - optimized for mobile */}
      <section
        className="py-6 relative overflow-hidden border-y border-white/10 dark:border-white/5"
        style={{
          background: 'linear-gradient(90deg, rgba(94,121,69,0.05), rgba(99,102,241,0.05))',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)'
        }}
      >
        <div className="absolute inset-0 pointer-events-none bg-white/40 dark:bg-black/20" />

        <div className="space-y-6 relative z-10">
          {/* Use CSS animation for low performance devices */}
          {isLowPerfDevice ? (
            <div className="overflow-hidden">
              <div className="flex items-center space-x-12 animate-marquee">
                {tokenRow1.map((token) => (
                  <TokenIcon key={token.name} name={token.name} image={token.image} />
                ))}
                {tokenRow1.map((token) => (
                  <TokenIcon key={`repeat-${token.name}`} name={token.name} image={token.image} />
                ))}
              </div>
            </div>
          ) : (
            <ParallaxText baseVelocity={-20}>
              <div className="flex items-center space-x-12">
                {tokenRow1.map((token) => (
                  <TokenIcon key={token.name} name={token.name} image={token.image} />
                ))}
              </div>
            </ParallaxText>
          )}

        </div>
      </section>

      {/* How It Works Section */}
      <HowItWorksSection />

      {/* Trust & Security Section */}
      <TrustAndSecuritySection />

      {/* Awards & Recognition Section — temporarily hidden */}
      {/* <AwardsSection /> */}

      {/* CTA Section */}
      <CTASection />

      </div>
    </ErrorBoundary>
  )
}
