"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface LTVSliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
}

export function LTVSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  className,
}: LTVSliderProps) {
  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-cyber-text-secondary text-sm font-inter font-medium">
          Loan-to-Value (LTV)
        </span>
        <span className="text-cyber-accent-primary text-lg font-mono font-medium">
          {value}%
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="cyber-slider w-full"
          style={{
            background: `linear-gradient(to right, #00F0FF 0%, #7B2CBF ${percentage}%, rgba(255, 255, 255, 0.1) ${percentage}%, rgba(255, 255, 255, 0.1) 100%)`,
          }}
        />
      </div>
    </div>
  )
}









