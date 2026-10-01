"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  Shield, 
  Activity,
  ArrowRight,
  Info
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AnimatedNumberProps {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
}

function AnimatedNumber({ value, decimals = 2, prefix = "", suffix = "", className }: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const duration = 1000
    const steps = 30
    const increment = value / steps
    let current = 0
    let step = 0

    const timer = setInterval(() => {
      step++
      current = Math.min(increment * step, value)
      setDisplayValue(current)
      if (step >= steps) {
        clearInterval(timer)
        setDisplayValue(value)
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [value])

  return (
    <span className={cn("cyber-text-mono cyber-number", className)}>
      {prefix}{displayValue.toFixed(decimals)}{suffix}
    </span>
  )
}

export function BaselineProtocolShowcase() {
  const [toggleActive, setToggleActive] = useState(false)
  const [inputValue, setInputValue] = useState("")

  return (
    <div className="cyber-elegant min-h-screen p-6 md:p-8 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-4 mb-12"
        >
          <h1 className="cyber-text-primary text-4xl md:text-5xl font-bold" style={{ fontFamily: 'var(--font-inter)' }}>
            Baseline Protocol
          </h1>
          <p className="cyber-text-secondary text-lg max-w-2xl mx-auto">
            Invisible Cyber-Finance: A fusion of professional restraint and subtle futuristic elegance
          </p>
        </motion.div>

        {/* Bento Grid Layout */}
        <div className="cyber-bento-grid">
          {/* Card 1: Available Credit with Radial Glow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="cyber-card cyber-radial-glow cyber-interactive"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="cyber-text-secondary text-sm">Available Credit</span>
                <Shield className="w-5 h-5" style={{ color: 'var(--status-success)' }} />
              </div>
              <div className="space-y-1">
                <div className="cyber-text-primary text-3xl font-bold cyber-text-mono">
                  <AnimatedNumber value={125000} prefix="$" decimals={0} />
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
                  <span className="cyber-text-secondary text-sm">+12.5% from last month</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 2: Net APY */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="cyber-card cyber-interactive"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="cyber-text-secondary text-sm">Net APY</span>
                <Activity className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div className="space-y-1">
                <div className="cyber-text-primary text-3xl font-bold cyber-text-mono">
                  <AnimatedNumber value={8.47} suffix="%" />
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
                  <span className="cyber-text-secondary text-sm">Optimized allocation</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 3: Supply Balance */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="cyber-card cyber-interactive"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="cyber-text-secondary text-sm">Supply Balance</span>
                <TrendingUp className="w-5 h-5 cyber-status-success" />
              </div>
              <div className="space-y-1">
                <div className="cyber-text-primary text-3xl font-bold cyber-text-mono">
                  <AnimatedNumber value={450000} prefix="$" decimals={0} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="cyber-text-secondary text-sm">Across 5 assets</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Card 4: Borrow Limit Usage */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="cyber-card cyber-interactive"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="cyber-text-secondary text-sm">Borrow Limit</span>
                <Info className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
              </div>
              <div className="space-y-3">
                <div className="cyber-text-primary text-2xl font-bold cyber-text-mono">
                  <AnimatedNumber value={62.5} suffix="%" />
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-card-hover)' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "62.5%" }}
                    transition={{ duration: 1, delay: 0.5 }}
                    className="h-full"
                    style={{ background: 'linear-gradient(to right, var(--accent-primary), var(--accent-secondary))' }}
                  />
                </div>
                <span className="cyber-text-secondary text-xs">$78,125 / $125,000</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Interactive Elements Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          {/* Input Field Demo */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            className="cyber-card"
          >
            <h3 className="cyber-text-primary text-lg font-medium mb-4">Input Field</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Enter amount..."
                className="cyber-input w-full"
              />
              <p className="cyber-text-tertiary text-xs">
                Focus state shows subtle cyan glow
              </p>
            </div>
          </motion.div>

          {/* Toggle Switch Demo */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.6 }}
            className="cyber-card"
          >
            <h3 className="cyber-text-primary text-lg font-medium mb-4">Toggle Switch</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div
                  className={cn("cyber-toggle", toggleActive && "active")}
                  onClick={() => setToggleActive(!toggleActive)}
                />
                <span className="cyber-text-secondary">
                  {toggleActive ? "Advanced Mode" : "Simple Mode"}
                </span>
              </div>
              <p className="cyber-text-tertiary text-xs">
                Heavy, smooth transition (0.4s cubic-bezier)
              </p>
            </div>
          </motion.div>
        </div>

        {/* Button Showcase */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.7 }}
          className="cyber-card"
        >
          <h3 className="cyber-text-primary text-lg font-medium mb-6">Button Styles</h3>
          <div className="flex flex-wrap gap-4">
            <button className="cyber-button">
              Secondary Action
            </button>
            <button className="cyber-button cyber-button-primary">
              Primary Action
            </button>
            <button className="cyber-button flex items-center gap-2">
              With Icon
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>

        {/* Status Indicators */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.8 }}
          className="cyber-card"
        >
          <h3 className="cyber-text-primary text-lg font-medium mb-6">Status Indicators</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ border: '1px solid var(--border-cyber)' }}>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--status-success)' }} />
              <div>
                <div className="cyber-text-primary font-medium">Success</div>
                <div className="cyber-text-secondary text-sm">Mint Neon (#34D399)</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ border: '1px solid var(--border-cyber)' }}>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--status-warning)' }} />
              <div>
                <div className="cyber-text-primary font-medium">Warning</div>
                <div className="cyber-text-secondary text-sm">Amber Glow (#FBBF24)</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ border: '1px solid var(--border-cyber)' }}>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--status-critical)' }} />
              <div>
                <div className="cyber-text-primary font-medium">Critical</div>
                <div className="cyber-text-secondary text-sm">Hot Magenta (#FF0080)</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Typography Showcase */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.9 }}
          className="cyber-card"
        >
          <h3 className="cyber-text-primary text-lg font-medium mb-6">Typography</h3>
          <div className="space-y-4">
            <div>
              <div className="cyber-text-primary text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-inter)' }}>
                Inter - Primary Text (Regular 400, Medium 500, Bold 700)
              </div>
              <div className="cyber-text-secondary text-sm">
                Used for headings, body text, and labels. Neutral, modern, and optimized for interfaces.
              </div>
            </div>
            <div>
              <div className="cyber-text-mono cyber-text-primary text-xl font-medium mb-2">
                JetBrains Mono - Technical Data
              </div>
              <div className="cyber-text-secondary text-sm">
                Monospace font for numbers, tickers, and technical specs. Ensures perfect column alignment.
              </div>
            </div>
          </div>
        </motion.div>

        {/* Design Principles */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 1.0 }}
          className="cyber-card cyber-glass"
        >
          <h3 className="cyber-text-primary text-lg font-medium mb-6">Design Principles</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h4 className="cyber-text-primary font-medium">Calm over Loud</h4>
              <p className="cyber-text-secondary text-sm">
                Dark, stable interface. Neon elements only for interactions, not decoration.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="cyber-text-primary font-medium">Bento-Grid Layout</h4>
              <p className="cyber-text-secondary text-sm">
                All content in clearly defined, strongly rounded containers. No floating text.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="cyber-text-primary font-medium">Progressive Disclosure</h4>
              <p className="cyber-text-secondary text-sm">
                Show only 2-3 key numbers. Hide technical details in bottom sheets.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="cyber-text-primary font-medium">Haptic Digital Feel</h4>
              <p className="cyber-text-secondary text-sm">
                Elements respond with subtle glow and smooth transitions. Premium hardware feel.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

