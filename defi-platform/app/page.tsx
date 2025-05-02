"use client"

import { useState, useEffect, useRef, useMemo } from "react"
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
} from "lucide-react"
import { useTheme } from "next-themes"
import { SubscribePopup } from "@/components/SubscribePopup"

// Interactive 3D card component with performance optimizations
const InteractiveCard = ({ children, className }) => {
  const { isLowPerfDevice } = useReducedMotion()
  const cardRef = useRef(null)
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

  const handleMouseMove = (e) => {
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
const ParallaxText = ({ children, baseVelocity = 100 }) => {
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
  const containerRef = useRef(null)
  
  useEffect(() => {
    if (containerRef.current) {
      // Measure the width of one copy of the content
      const firstChild = containerRef.current.firstChild
      if (firstChild) {
        setContentWidth(firstChild.offsetWidth)
      }
    }
  }, [children])

  useEffect(() => {
    let prevT = 0
    let ticker = null

    // Initialize starting point based on direction
    if (direction > 0) {
      // For right-to-left scrolling, start from negative width
      baseX.set(-contentWidth)
    }

    const tick = (t) => {
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
const IsomorphicText = ({ text, className }) => {
  const { isLowPerfDevice } = useReducedMotion()
  const isMobile = useMobile()
  const letters = text.split("")

  // For low performance devices, render static text
  if (isLowPerfDevice) {
    return <div className={cn("relative", className)}>{text}</div>
  }

  return (
    <div className={cn("relative", className)}>
      {letters.map((letter, index) => (
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
const MagneticButton = ({ children, className, ...props }) => {
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
const FeatureCard = ({ icon: Icon, title, description, delay = 0 }) => {
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
const FloatingElement = ({ children, xOffset = 0, yOffset = 0, duration = 3 }) => {
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
const AnimatedValueVisualization = ({ value, icon, description }) => {
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
const DonutChart = ({ value, max = 100, size = 120, strokeWidth = 10, color = "var(--primary)" }) => {
  const { isLowPerfDevice } = useReducedMotion()
  const percentage = (value / max) * 100
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const [displayPercentage, setDisplayPercentage] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false) // Add a state to track animation

  // Use a ref to track the animation frame ID
  const animationFrameIdRef = useRef(null)

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
const TokenIcon = ({ name, image }) => {
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

export default function Home() {
  const { scrollYProgress } = useScroll()
  const isMobile = useMobile()
  const { isLowPerfDevice, prefersReducedMotion } = useReducedMotion()
  const heroRef = useRef(null)
  const { theme } = useTheme()

  // Memoize token data to prevent unnecessary re-renders
  const tokenRow1 = useMemo(
    () => [
      { name: "Ethereum", image: "/tokenimages/eth.png" },
      { name: "Polygon", image: "/tokenimages/matic.png" },
      { name: "Avalanche", image: "/tokenimages/avax.png" },
      { name: "Solana", image: "/tokenimages/sol.png" },
      { name: "Chainlink", image: "/tokenimages/link.png" },
    ],
    [],
  )

  const tokenRow2 = useMemo(
    () => [
      { name: "Arbitrum", image: "/tokenimages/arb.png" },
      { name: "Cosmos", image: "/tokenimages/cosm.png" },
      { name: "USDC", image: "/tokenimages/usdc.png" },
      { name: "Dai", image: "/tokenimages/dai.png" },
      { name: "Aave", image: "/tokenimages/aave.png" },
    ],
    [],
  )

  // Optimize mouse tracking for performance
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  // Parallax effect for hero section - disable on low performance devices
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, isLowPerfDevice ? 0 : -150])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0])

  // Optimize mouse movement tracking
  useEffect(() => {
    // Define the handler outside of the conditional to avoid hook ordering issues
    const handleMouseMove = (e) => {
      const x = e.clientX / window.innerWidth
      const y = e.clientY / window.innerHeight

      // Update motion values directly instead of state
      mouseX.set(x)
      mouseY.set(y)
    }

    // Skip on low performance devices
    if (isLowPerfDevice) {
      return () => {} // Return an empty cleanup function
    }

    // Use a throttled function to reduce updates
    let lastUpdateTime = 0
    const THROTTLE_MS = 50 // Only update every 50ms

    const throttledHandleMouseMove = (e) => {
      const currentTime = Date.now()
      if (currentTime - lastUpdateTime < THROTTLE_MS) return

      lastUpdateTime = currentTime
      handleMouseMove(e)
    }

    const addMouseMoveListener = () => {
      window.addEventListener("mousemove", throttledHandleMouseMove)
    }

    const removeMouseMoveListener = () => {
      window.removeEventListener("mousemove", throttledHandleMouseMove)
    }

    addMouseMoveListener()

    return () => {
      removeMouseMoveListener()
    }
  }, [mouseX, mouseY, isLowPerfDevice])

  // Optimize background transform
  const backgroundX = useTransform(mouseX, [0, 1], ["-2%", "2%"])
  const backgroundY = useTransform(mouseY, [0, 1], ["-2%", "2%"])

  return (
    <div className="flex flex-col min-h-screen">
      {/* Subscribe Popup */}
      <SubscribePopup />
      
      {/* Hero Section */}
      <motion.section
        ref={heroRef}
        className="relative pt-28 md:pt-40 pb-20 md:pb-32 overflow-hidden"
        style={{
          y: heroY,
          opacity: heroOpacity,
        }}
      >
        {/* Dynamic background - simplified for mobile */}
        {!isLowPerfDevice && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5 z-0"
            style={{
              x: backgroundX,
              y: backgroundY,
              scale: 1.1,
            }}
            transition={{ type: "spring", damping: 25, stiffness: 100 }}
          />
        )}

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
                        <AnimatedValueVisualization value="$1.2B+" icon="tvl" description="Across all supported chains" />
                      </div>
                    </motion.div>

                    <motion.div
                      className="relative overflow-hidden rounded-xl"
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                      <div className="p-4">
                        <p className="text-sm text-primary font-medium mb-2">Total Users</p>
                        <AnimatedValueVisualization value="125K+" icon="users" description="Active platform users" />
                      </div>
                    </motion.div>

                    <motion.div
                      className="relative overflow-hidden rounded-xl"
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                      <div className="p-4">
                        <p className="text-sm text-primary font-medium mb-2">Supported Chains</p>
                        <AnimatedValueVisualization value="8+" icon="chains" description="Cross-chain compatibility" />
                      </div>
                    </motion.div>

                    <motion.div
                      className="relative overflow-hidden rounded-xl"
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                      <div className="p-4">
                        <p className="text-sm text-primary font-medium mb-2">Interest Earned</p>
                        <AnimatedValueVisualization value="$45M+" icon="interest" description="Total user earnings" />
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
                </InteractiveCard>
              </motion.div>
            )}
          </div>

          {!isLowPerfDevice && <ScrollIndicator />}
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
      <section className="py-20 bg-background relative overflow-hidden">
        {/* Content remains the same but with optimized components */}
        {/* ... */}
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

      {/* How It Works Section */}
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

      {/* FAQ Section */}
      <section className="py-20 bg-background relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <FloatingElement xOffset={-50} yOffset={100} duration={8}>
            <div className="w-[400px] h-[400px] rounded-full bg-primary/5 blur-3xl absolute left-0 bottom-0" />
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
            <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
            <p className="text-text/70">Find answers to common questions about Peridot and how to use our platform.</p>
          </motion.div>

          <motion.div
            className="max-w-3xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="item-1" className="bg-card border border-border/50 rounded-xl px-6 overflow-hidden">
                <AccordionTrigger className="text-lg font-medium py-4 group">
                  <span>What is Peridot?</span>
                </AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    Peridot is a decentralized cross-chain lending and borrowing platform that enables users to earn
                    interest on their crypto assets and borrow against their collateral. The platform uses algorithmic
                    interest rates based on supply and demand to create efficient money markets for various crypto
                    assets across multiple blockchains.
                  </motion.div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="bg-card border border-border/50 rounded-xl px-6 overflow-hidden">
                <AccordionTrigger className="text-lg font-medium py-4 group">
                  <span>How do I start using Peridot?</span>
                </AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    To start using Peridot, you need to connect your wallet (such as MetaMask, Phantom, or other
                    supported wallets) to our platform. Once connected, you can supply assets to earn interest or borrow
                    against your collateral. Visit our "Launch App" page and click on "Connect Wallet" to get started.
                  </motion.div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="bg-card border border-border/50 rounded-xl px-6 overflow-hidden">
                <AccordionTrigger className="text-lg font-medium py-4 group">
                  <span>What blockchains does Peridot support?</span>
                </AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    Peridot currently supports Ethereum, Polygon, Avalanche, Binance Smart Chain, Arbitrum, Optimism,
                    Solana, and more. We're continuously working to add support for additional blockchains to enhance
                    cross-chain functionality and provide users with more options.
                  </motion.div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="bg-card border border-border/50 rounded-xl px-6 overflow-hidden">
                <AccordionTrigger className="text-lg font-medium py-4 group">
                  <span>How are interest rates determined?</span>
                </AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    Interest rates on Peridot are determined algorithmically based on the utilization rate of each
                    asset. When demand for borrowing an asset is high (high utilization), interest rates increase to
                    incentivize more supply. When demand is low, rates decrease to encourage more borrowing. This
                    dynamic adjustment ensures optimal capital efficiency and fair rates for all users.
                  </motion.div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" className="bg-card border border-border/50 rounded-xl px-6 overflow-hidden">
                <AccordionTrigger className="text-lg font-medium py-4 group">
                  <span>Is Peridot secure?</span>
                </AccordionTrigger>
                <AccordionContent className="text-text/80 pb-4">
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    Peridot prioritizes security through multiple measures: our smart contracts have undergone rigorous
                    security audits by leading firms, we implement robust risk management protocols, and we maintain a
                    conservative approach to collateral factors. Additionally, our non-custodial architecture means
                    users always maintain control of their assets.
                  </motion.div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <motion.div
              className="text-center mt-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <Button asChild variant="outline" className="rounded-xl group">
                <Link href="/faq" className="flex items-center">
                  View All FAQs
                  <motion.div
                    className="ml-2"
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </motion.div>
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-secondary to-accent/70 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute inset-0 bg-[url('/interconnected-geometric-finance.png')] bg-no-repeat bg-cover opacity-5"
            animate={{
              backgroundPosition: ["0% 0%", "100% 100%"],
            }}
            transition={{
              duration: 50,
              repeat: Number.POSITIVE_INFINITY,
              repeatType: "reverse",
            }}
          />
        </div>

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <motion.div
            className="max-w-3xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
          >
            <motion.h2
              className="text-3xl font-bold mb-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              Ready to Start Earning?
            </motion.h2>
            <motion.p
              className="text-lg mb-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Join thousands of users already earning interest and accessing liquidity on Peridot.
            </motion.p>
            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
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
                  className="bg-background/10 border-text/20 hover:bg-background/20 rounded-xl"
                >
                  <Link href="/docs" className="flex items-center">
                    Read Documentation
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
          </motion.div>
        </div>
      </section>
    </div>
  )
}
