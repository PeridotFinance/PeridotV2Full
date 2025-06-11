"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";

// Component for animated number counter
export const AnimatedCounter = ({ 
  value, 
  prefix = "", 
  suffix = "", 
  duration = 1 
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) => {
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
}: {
  data: Array<{day: number; value: number}>;
  color?: string;
  height?: number;
  width?: number;
}) => {
  const pathRef = useRef(null)
  const isInView = useInView(pathRef, { once: true })

  // Create SVG path
  const createPath = () => {
    if (!data || data.length < 2) { // Need at least 2 points to draw a line
      return ""; 
    }

    const values = data.map(d => d.value);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    let range = maxValue - minValue;

    // If range is 0 (all points are the same), draw a horizontal line in the middle.
    if (range === 0) {
      const y = height / 2;
      // Ensure x coordinates are distinct for a line
      return `M${(0).toFixed(2)},${y.toFixed(2)} L${width.toFixed(2)},${y.toFixed(2)}`;
    }

    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const yValue = d.value - minValue;
      const y = height - ((yValue / range) * height);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    return `M${points.join(" L")}`;
  };

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

// Interactive donut chart component
export const DonutChart = ({ 
  value, 
  max = 100, 
  size = 120, 
  strokeWidth = 10, 
  color = "var(--primary)" 
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) => {
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

// Animated card component - OPTIMIZED FOR PERFORMANCE
export const AnimatedCard = ({ 
  children, 
  delay = 0, 
  ...props 
}: {
  children: React.ReactNode;
  delay?: number;
  [key: string]: any;
}) => {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.1 }) // Reduced threshold

  return (
    <motion.div
      ref={ref}
      initial={{ y: 10, opacity: 0 }} // Reduced movement
      animate={isInView ? { y: 0, opacity: 1 } : { y: 10, opacity: 0 }}
      transition={{
        duration: 0.3, // Reduced from 0.5s
        delay: Math.min(delay, 0.1), // Cap delay at 100ms
        ease: "easeOut", // Simpler easing
      }}
      {...props}
    >
      {children}
    </motion.div>
  )
} 