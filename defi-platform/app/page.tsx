"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, useScroll, useTransform, useMotionValue, useSpring } from "framer-motion"
import { Button } from "@/components/ui/button"
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
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
  ExternalLink,
  MousePointerClick,
  MousePointer,
} from "lucide-react"
import { useTheme } from "next-themes"
import { SubscribePopup } from "@/components/SubscribePopup"
import dynamic from "next/dynamic" // Added import for dynamic
import { CookieConsentBanner } from "@/components/CookieConsentBanner"

// Dynamically import SubscribePopup
const DynamicSubscribePopup = dynamic(() => import("@/components/SubscribePopup").then(mod => mod.SubscribePopup), {
  loading: () => <p>Loading...</p>, // Optional loading component
  ssr: false // Disable server-side rendering for this component if it's client-side only
})

// Dynamically import FeaturesSection
const DynamicFeaturesSection = dynamic(() => import("@/components/landing/FeaturesSection").then(mod => mod.FeaturesSection), {
  loading: () => <p>Loading section...</p>,
  ssr: false
})

// Dynamically import HowItWorksSection
const DynamicHowItWorksSection = dynamic(() => import("@/components/landing/HowItWorksSection").then(mod => mod.HowItWorksSection), {
  loading: () => <p>Loading section...</p>,
  ssr: false
})

// Dynamically import FAQSection
const DynamicFAQSection = dynamic(() => import("@/components/landing/FAQSection").then(mod => mod.FAQSection), {
  loading: () => <p>Loading section...</p>,
  ssr: false
})

// Dynamically import CTASection
const DynamicCTASection = dynamic(() => import("@/components/landing/CTASection").then(mod => mod.CTASection), {
  loading: () => <p>Loading section...</p>,
  ssr: false
})

// Interactive 3D card component with performance optimizations
const InteractiveCard = ({ 
  children, 
  className 
}: { 
  children: React.ReactNode; 
  className?: string;
}) => {
  const { isLowPerfDevice } = useReducedMotion()
  const cardRef = useRef<HTMLDivElement>(null)
  const [rotateX, setRotateX] = useState(0)
  const [rotateY, setRotateY] = useState(0)
  const [scale, setScale] = useState(1)

  // Skip 3D effects on low performance devices
  if (isLowPerfDevice) {
    return (
      <div className={cn("relative overflow-hidden transition-all duration-200", className)}>
        <div className="relative z-10">{children}</div>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0"></div>
      </div>
    )
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const card = cardRef.current
    const rect = card.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const posX = e.clientX - centerX
    const posY = e.clientY - centerY

    // Calculate rotation based on mouse position
    const rotateXValue = (posY / (rect.height / 2)) * -5
    const rotateYValue = (posX / (rect.width / 2)) * 5

    setRotateX(rotateXValue)
    setRotateY(rotateYValue)
    setScale(1.02)
  }

  const handleMouseLeave = () => {
    setRotateX(0)
    setRotateY(0)
    setScale(1)
  }

  return (
    <motion.div
      ref={cardRef}
      className={cn("relative overflow-hidden transition-all duration-200", className)}
      style={{
        transformStyle: "preserve-3d",
        transform: `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative z-10">{children}</div>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0"></div>
    </motion.div>
  )
}

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
  const letters = text.split("")

  // For low performance devices, render static text
  if (isLowPerfDevice) {
    return <div className={cn("relative", className)}>{text}</div>
  }

  return (
    <div className={cn("relative", className)}>
      {letters.map((letter: string, index: number) => (
        <motion.span
          key={index}
          className="inline-block relative"
          initial={{ opacity: 0, y: 20, rotateX: -30 }}
          animate={{
            opacity: 1,
            y: 0,
            rotateX: 0,
            transition: {
              duration: 0.8,
              delay: 0.05 * index,
              ease: [0.215, 0.61, 0.355, 1],
            },
          }}
          style={{
            textShadow: !isMobile ? `0px 10px 20px rgba(0, 0, 0, 0.2)` : "none",
            transform: "preserve-3d", // Changed from transformStyle
            transformOrigin: "center bottom",
          }}
        >
          {letter === " " ? "\u00A0" : letter}
        </motion.span>
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

  // Skip animation on low performance devices
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
        className="absolute -inset-4 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(127, 183, 113, 0.15) 0%, rgba(127, 183, 113, 0) 50%)",
          borderRadius: "50%",
          opacity: 0,
        }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
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

const FeatureCard = ({ icon: Icon, title, description, delay = 0 }: FeatureCardProps) => {
  const { isLowPerfDevice } = useReducedMotion()

  // Simplified version for low performance devices
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

// Optimized floating elements animation
interface FloatingElementProps {
  children: React.ReactNode;
  xOffset?: number;
  yOffset?: number;
  duration?: number;
}

const FloatingElement = ({ children, xOffset = 0, yOffset = 0, duration = 3 }: FloatingElementProps) => {
  const { isLowPerfDevice } = useReducedMotion()

  // Skip animation on low performance devices
  if (isLowPerfDevice) {
    return <div style={{ transform: `translate(${xOffset}px, ${yOffset}px)` }}>{children}</div>
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
                    backgroundColor: isHovered ? "rgba(127, 183, 113, 0.4)" : "rgba(127, 183, 113, 0.2)",
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
                  const radius = isMobile ? 30 : 40
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
                    const radius = isMobile ? 30 : 40
                    const x = Math.cos(angle) * radius
                    const y = Math.sin(angle) * radius

                    return (
                      <motion.line
                        key={i}
                        x1="0"
                        y1="0"
                        x2={x}
                        y2={y}
                        stroke="rgba(127, 183, 113, 0.3)"
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
        whileHover={{ scale: 1.2, boxShadow: "0 0 8px rgba(127, 183, 113, 0.6)" }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
      >
        <Image src={image || "/placeholder.svg"} width={24} height={24} alt={name} className="object-contain" />
      </motion.div>
      <span className="text-sm font-medium">{name}</span>
    </div>
  )
}

// Simple toggle button to disable parallax effects
interface ParallaxToggleProps {
  isEnabled: boolean;
  onToggle: () => void;
}

const ParallaxToggle = ({ isEnabled, onToggle }: ParallaxToggleProps) => {
  return (
    <button
      onClick={onToggle}
      className="fixed top-2 right-2 z-50 p-2 text-xs flex items-center gap-1 bg-card/80 backdrop-blur-sm rounded-full border border-border/50 shadow-sm hover:bg-card transition-colors duration-200"
      title={isEnabled ? "Disable motion effects" : "Enable motion effects"}
      aria-label={isEnabled ? "Disable motion effects" : "Enable motion effects"}
    >
      {isEnabled ? (
        <MousePointerClick className="h-3 w-3 text-primary" />
      ) : (
        <MousePointer className="h-3 w-3 text-text/50" />
      )}
      <span className="sr-only md:not-sr-only md:inline-block">
        {isEnabled ? "Reduce motion" : "Enable motion"}
      </span>
    </button>
  );
};

export default function Home() {
  const { resolvedTheme } = useTheme();
  const isMobile = useMobile();
  // Revert useReducedMotion to its likely original form based on the error
  const { isLowPerfDevice, prefersReducedMotion } = useReducedMotion(); 
  const [showPopup, setShowPopup] = useState(false); 
  const [isParallaxEnabled, setIsParallaxEnabled] = useState(!isLowPerfDevice);
  const { scrollYProgress } = useScroll();
  const [disableParallax, setDisableParallax] = useState(false);
  const heroRef = useRef(null)
  // Handle toggle for parallax effects
  const toggleParallax = useCallback(() => {
    setDisableParallax(prev => !prev);
    // Save preference to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('disableParallax', (!disableParallax).toString());
    }
  }, [disableParallax]);
  // Existing useEffect for popup
  useEffect(() => {
    const timer = setTimeout(() => setShowPopup(true), 15000);
    return () => clearTimeout(timer);
  }, []);

  // Adjust this useEffect dependency based on the reverted useReducedMotion
  useEffect(() => {
    const handleParallaxToggle = () => {
      const savedPreference = localStorage.getItem("disableParallax");
      if (savedPreference !== null) {
        setDisableParallax(savedPreference === 'true');
      } else if (prefersReducedMotion) { // Use prefersReducedMotion here
        setDisableParallax(true);
      }
    };
    handleParallaxToggle();
  }, [prefersReducedMotion]); // Use prefersReducedMotion in dependency array

  // Memoize token data to prevent unnecessary re-renders
  const tokenRow1 = useMemo(
    () => [
      { name: "Ethereum", image: "/tokenimages/eth.png" },
      { name: "Stellar", image: "/tokenimages/stellar.png" },
      { name: "Polygon", image: "/tokenimages/matic.png" },
      { name: "Avalanche", image: "/tokenimages/avax.png" },
      { name: "Solana", image: "/tokenimages/sol.png" },
      { name: "Chainlink", image: "/tokenimages/link.png" },
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

  // Optimize mouse tracking for performance
  const mouseX = useMotionValue(0.5) // Initialize at center
  const mouseY = useMotionValue(0.5) // Initialize at center

  // Parallax effect for hero section - disable on low performance devices
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, isLowPerfDevice ? 0 : -150])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0])

  // Check for FPS issues and disable effects if needed
  useEffect(() => {
    if (disableParallax || isLowPerfDevice) return;
    
    // Simple FPS tracking to detect performance issues
    let frameCount = 0;
    let lastTime = performance.now();
    let lowFPSCount = 0;
    
    const checkFPS = () => {
      const now = performance.now();
      const elapsed = now - lastTime;
      if (elapsed >= 1000) { // Every second
        const fps = frameCount / (elapsed / 1000);
        if (fps < 30) { // If FPS drops below 30
          lowFPSCount++;
          if (lowFPSCount >= 3) { // If we get 3 consecutive low FPS readings
            setDisableParallax(true);
            return; // Stop checking
          }
        } else {
          lowFPSCount = 0; // Reset counter if FPS is good
        }
        
        frameCount = 0;
        lastTime = now;
      }
      frameCount++;
      requestAnimationFrame(checkFPS);
    };
    
    const fpsCheckId = requestAnimationFrame(checkFPS);
    return () => cancelAnimationFrame(fpsCheckId);
  }, [disableParallax, isLowPerfDevice]);

  // Optimize mouse movement tracking
  useEffect(() => {
    // Skip on low performance devices or if parallax is disabled
    if (isLowPerfDevice || disableParallax) {
      return () => {}; // Return an empty cleanup function
    }

    let rafId = null;
    let lastUpdateTime = 0;
    const THROTTLE_MS = 200; // Even higher throttle time

    const handleMouseMove = (e) => {
      const currentTime = performance.now();
      if (currentTime - lastUpdateTime < THROTTLE_MS) return;
      
      lastUpdateTime = currentTime;
      
      // Schedule the update on the next frame
      rafId = requestAnimationFrame(() => {
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;
        
        // Smoother value updates with dampening
        const currentX = mouseX.get();
        const currentY = mouseY.get();
        const newX = currentX + (x - currentX) * 0.2; // Apply dampening factor
        const newY = currentY + (y - currentY) * 0.2;
        
        mouseX.set(newX);
        mouseY.set(newY);
      });
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [mouseX, mouseY, isLowPerfDevice, disableParallax]);

  // Optimize background transform - use more subtle movement
  const backgroundX = useTransform(mouseX, [0, 1], ["-0.5%", "0.5%"]); // Even more subtle movement
  const backgroundY = useTransform(mouseY, [0, 1], ["-0.5%", "0.5%"]);
  
  // Memoize the background component to prevent unnecessary re-renders
  const BackgroundEffect = useMemo(() => {
    if (isLowPerfDevice || disableParallax) return null;
    
    return (
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5 z-0"
        style={{
          x: backgroundX,
          y: backgroundY,
          scale: 1.05, // Reduced scale for better performance
        }}
        transition={{ 
          type: "tween", // Changed from spring to tween for better performance
          ease: "linear",
          duration: 0.2
        }}
      />
    );
  }, [backgroundX, backgroundY, isLowPerfDevice, disableParallax]);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Parallax Toggle */}
      <ParallaxToggle isEnabled={!disableParallax} onToggle={toggleParallax} />
      
      {/* Cookie Consent Banner */}
      <CookieConsentBanner />

      {/* Subscribe Popup */}
      <DynamicSubscribePopup />
      
      {/* Hero Section */}
      <motion.section
        ref={heroRef}
        className="relative pt-16 md:pt-40 pb-20 md:pb-32 overflow-hidden"
        style={{
          y: heroY,
          opacity: heroOpacity,
        }}
      >
        {/* Dynamic background - simplified for mobile */}
        {BackgroundEffect}

        {/* Floating elements - only on desktop */}
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
              {/* Animated subtitle */}
              <motion.p
                className="text-primary font-medium tracking-wider"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                THE FUTURE OF DECENTRALIZED FINANCE
              </motion.p>

              {/* 3D Isomorphic title - Fixed to prevent word breaks */}
              <div className="space-y-2">
                <div className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight gradient-text whitespace-nowrap">
                  <IsomorphicText text="Peridot" className="text-foreground" />{" "}
                  {/* Changed from "Cross-Chain" to "Peridot" and fixed visibility */}
                </div>
                <div className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight whitespace-nowrap">
                  <IsomorphicText text="Lend & Borrow Crypto" />
                </div>
              </div>

              <motion.p
                className="text-lg md:text-xl text-text/80 max-w-xl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                Earn interest on your crypto and borrow funds without selling—all with smart, fair rates across multiple
                blockchains.
              </motion.p>

              <motion.div
                className="flex flex-col sm:flex-row gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                <MagneticButton>
                  <Button
                    asChild
                    size="lg"
                    className="bg-primary text-background hover:bg-primary/90 rounded-xl group relative overflow-hidden"
                  >
                    <Link href="/app" className="flex items-center">
                      <span className="relative z-10">Launch App</span>
                      <motion.div
                        className="relative z-10 ml-2"
                        animate={{ x: [0, 4, 0] }}
                        transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </motion.div>
                      <motion.div
                        className="absolute inset-0 bg-primary-foreground/10"
                        initial={{ x: "-100%" }}
                        whileHover={{ x: "100%" }}
                        transition={{ duration: 0.6 }}
                      />
                    </Link>
                  </Button>
                </MagneticButton>

                <MagneticButton>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="border-primary/20 hover:border-primary/40 rounded-xl group"
                  >
                    <Link href="/how-it-works" className="flex items-center">
                      Learn More
                      <motion.div
                        animate={{
                          x: [0, 5, 0],
                          opacity: [1, 0.8, 1],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Number.POSITIVE_INFINITY,
                          repeatType: "reverse",
                        }}
                        className="ml-2"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </motion.div>
                    </Link>
                  </Button>
                </MagneticButton>
              </motion.div>
            </div>

            {/* Only render the animated 3D tile section on desktop */}
            {!isMobile && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-2xl blur-3xl opacity-30"></div>
                <InteractiveCard className="relative bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-6 shadow-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div
                      className="relative overflow-hidden rounded-xl"
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                      <div className="p-4">
                        <p className="text-sm text-primary font-medium mb-2">Total Value Locked</p>
                        <AnimatedValueVisualization value="$1.2B*" icon="tvl" description="Across all supported chains" />
                      </div>
                    </motion.div>

                    <motion.div
                      className="relative overflow-hidden rounded-xl"
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                      <div className="p-4">
                        <p className="text-sm text-primary font-medium mb-2">Total Users</p>
                        <AnimatedValueVisualization value="125K*" icon="users" description="Active platform users" />
                      </div>
                    </motion.div>

                    <motion.div
                      className="relative overflow-hidden rounded-xl"
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                      <div className="p-4">
                        <p className="text-sm text-primary font-medium mb-2">Supported Chains</p>
                        <AnimatedValueVisualization value="8*" icon="chains" description="Cross-chain compatibility" />
                      </div>
                    </motion.div>

                    <motion.div
                      className="relative overflow-hidden rounded-xl"
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                      <div className="p-4">
                        <p className="text-sm text-primary font-medium mb-2">Interest Earned</p>
                        <AnimatedValueVisualization value="$45M*" icon="interest" description="Total user earnings" />
                      </div>
                    </motion.div>
                  </div>

                  {/* Animated decorative elements - simplified for mobile */}
                  {!isLowPerfDevice && (
                    <>
                      <div className="absolute -top-6 -right-6 w-12 h-12 bg-primary/20 rounded-full blur-xl animate-pulse" />
                      <div className="absolute -bottom-8 -left-8 w-16 h-16 bg-accent/20 rounded-full blur-xl animate-pulse" />
                    </>
                  )}

                  {/* Disclaimer text */}
                  <div className="mt-4 text-xs text-text/50 text-center">
                    * These metrics represent projected values based on our platform's design and market analysis. Actual values will be updated in real-time once the platform is live.
                  </div>
                </InteractiveCard>
              </motion.div>
            )}
          </div>

          {!isLowPerfDevice && !isMobile && <ScrollIndicator />}
        </div>
      </motion.section>

      {/* Animated marquee section - optimized for mobile */}
      <motion.section
        className="py-4 bg-muted/50 overflow-hidden"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8 }}
      >
        <div className="space-y-6">
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

          {isLowPerfDevice ? (
            <div className="overflow-hidden">
              <div className="flex items-center space-x-12 animate-marquee-reverse">
                {tokenRow2.map((token) => (
                  <TokenIcon key={token.name} name={token.name} image={token.image} />
                ))}
                {tokenRow2.map((token) => (
                  <TokenIcon key={`repeat-${token.name}`} name={token.name} image={token.image} />
                ))}
              </div>
            </div>
          ) : (
            <ParallaxText baseVelocity={15}>
              <div className="flex items-center space-x-12">
                {tokenRow2.map((token) => (
                  <TokenIcon key={token.name} name={token.name} image={token.image} />
                ))}
              </div>
            </ParallaxText>
          )}
        </div>
      </motion.section>

      {/* Rest of the page content - optimized for performance */}
      {/* Features Section */}
      <DynamicFeaturesSection />

      {/* How It Works Section */}
      <DynamicHowItWorksSection />

      {/* FAQ Section */}
      <DynamicFAQSection />

      {/* CTA Section */}
      <DynamicCTASection />

    </div>
  )
}
