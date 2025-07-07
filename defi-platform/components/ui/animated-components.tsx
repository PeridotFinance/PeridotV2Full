"use client"

import { useState, useEffect, useRef } from "react"
import { motion, useInView } from "framer-motion"
import { AnimatedCounterProps, MiniChartProps, AnimatedCardProps, DonutChartProps } from "@/types/markets"

// Component for animated number counter
export const AnimatedCounter = ({ 
  value, 
  prefix = "", 
  suffix = "", 
  duration = 1 
}: AnimatedCounterProps) => {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    let startTime: number | null = null
    let animationFrame: number | null = null

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1)

      setDisplayValue(Math.floor(progress * value))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
    }
  }, [value, duration])

  return (
    <span>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  )
}

// Mini chart component
export const MiniChart = ({ 
  data, 
  color = "#22c55e", 
  height = 40, 
  width = 100 
}: MiniChartProps) => {
  const pathRef = useRef(null)
  const isInView = useInView(pathRef, { once: true })

  // Normalize data for the chart
  const maxValue = Math.max(...data.map((d) => d.value))
  const minValue = Math.min(...data.map((d) => d.value))
  const range = maxValue - minValue

  // Create SVG path
  const createPath = () => {
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((d.value - minValue) / range) * height
      return `${x},${y}`
    })

    return `M${points.join(" L")}`
  }

  return (
    <svg width={width} height={height} className="overflow-visible">
      <motion.path
        ref={pathRef}
        d={createPath()}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={isInView ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
      />
    </svg>
  )
}

// Animated card component
export const AnimatedCard = ({ 
  children, 
  delay = 0, 
  ...props 
}: AnimatedCardProps) => {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.3 })

  return (
    <motion.div
      ref={ref}
      initial={{ y: 20, opacity: 0 }}
      animate={isInView ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
      transition={{
        duration: 0.5,
        delay: delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

// Interactive donut chart component
export const DonutChart = ({ 
  value, 
  max = 100, 
  size = 120, 
  strokeWidth = 10, 
  color = "var(--primary)" 
}: DonutChartProps) => {
  const percentage = (value / max) * 100
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  const [displayPercentage, setDisplayPercentage] = useState(0)

  useEffect(() => {
    let startTime: number | null = null
    let animationFrame: number | null = null

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / 1500, 1)

      setDisplayPercentage(Math.round(progress * percentage))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
    }
  }, [percentage])

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
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
          strokeLinecap="round"
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold">{displayPercentage}%</span>
      </div>
    </div>
  )
} 