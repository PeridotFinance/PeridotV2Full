"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface CircularProgressProps {
  value: number // 0-100
  size?: number
  strokeWidth?: number
  children?: React.ReactNode
  className?: string
  gradient?: boolean
}

export function CircularProgress({
  value,
  size = 200,
  strokeWidth = 8,
  children,
  className,
  gradient = true,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (value / 100) * circumference

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="cyber-progress-ring"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={gradient ? "url(#cyber-gradient)" : "#00F0FF"}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
        {gradient && (
          <defs>
            <linearGradient id="cyber-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00F0FF" />
              <stop offset="50%" stopColor="#7B2CBF" />
              <stop offset="100%" stopColor="#34D399" />
            </linearGradient>
          </defs>
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}









