"use client"

import React, { useState } from "react"
import { useTheme } from "next-themes"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Zap, TrendingUp, Gift, Sparkles, ChevronDown, ChevronUp } from "lucide-react"

interface BoostedBannerProps {
  theme: string | undefined
}

export default function BoostedBanner({ theme: themeProp }: BoostedBannerProps) {
  const { theme, resolvedTheme } = useTheme()
  const effectiveTheme = resolvedTheme || theme || themeProp || "dark"
  const [isExpanded, setIsExpanded] = useState(false)

  const advantages = [
    {
      icon: TrendingUp,
      title: "Multi-Yield Stacking",
      description: "Earn lending APR + additional yield from vaults, LPs, or Merkl rewards"
    },
    {
      icon: Zap,
      title: "Optimized Returns",
      description: "Smart contracts automatically allocate funds to highest-yielding strategies"
    },
    {
      icon: Gift,
      title: "Bonus Incentives",
      description: "Extra rewards from ecosystem partners and protocol incentives"
    }
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "relative overflow-hidden rounded-2xl",
        "backdrop-blur-xl border",
        effectiveTheme === "light"
          ? "bg-gradient-to-br from-purple-50/80 via-pink-50/60 to-emerald-50/60 border-purple-200/50"
          : "bg-gradient-to-br from-purple-500/10 via-pink-500/8 to-emerald-500/10 border-purple-500/30",
        "shadow-2xl",
        effectiveTheme === "light"
          ? "shadow-purple-500/20"
          : "shadow-purple-500/40",
        // Mobile: max height constraint
        "max-h-[50vh] md:max-h-none overflow-hidden"
      )}
    >
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-pink-500/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-purple-400/60 rounded-full"
            initial={{
              x: Math.random() * 100 + '%',
              y: Math.random() * 100 + '%',
              opacity: 0
            }}
            animate={{
              y: ['0%', '-20%', '0%'],
              opacity: [0, 1, 0]
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2
            }}
          />
        ))}
      </div>

      <div className="relative">
        {/* Mobile: Compact Header */}
        <div className="p-4 md:p-6 md:pb-4">
          <div className="flex items-center justify-between">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="flex items-center gap-2"
            >
              <div className="relative">
                <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-purple-500" />
                <motion.div
                  className="absolute inset-0 text-purple-500"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Sparkles className="h-5 w-5 md:h-6 md:w-6" />
                </motion.div>
              </div>
              <div>
                <h2 className={cn(
                  "text-lg md:text-xl font-bold",
                  effectiveTheme === "light" ? "text-purple-900" : "text-white"
                )}>
                  🚀 Boosted Markets
                </h2>
                <p className={cn(
                  "text-xs md:text-sm",
                  effectiveTheme === "light" ? "text-purple-700" : "text-purple-300"
                )}>
                  Multi-yield strategies for maximum returns
                </p>
              </div>
            </motion.div>

            {/* Mobile: Expand/Collapse Button */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.3 }}
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                "md:hidden flex items-center gap-1 px-3 py-1.5 rounded-lg",
                "backdrop-blur-sm border transition-all duration-200",
                effectiveTheme === "light"
                  ? "bg-white/60 border-purple-200/50 text-purple-700 hover:bg-white/80"
                  : "bg-white/10 border-purple-500/30 text-purple-300 hover:bg-white/20"
              )}
            >
              <span className="text-xs font-medium">
                {isExpanded ? "Less" : "More"}
              </span>
              {isExpanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </motion.button>
          </div>
        </div>

        {/* Desktop: Full content always visible */}
        <div className="hidden md:block px-6 pb-6">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            className={cn(
              "text-sm leading-relaxed max-w-2xl mx-auto mb-6 text-center",
              effectiveTheme === "light" ? "text-purple-700" : "text-purple-200"
            )}
          >
            Experience the next evolution of DeFi yield farming. Our boosted markets combine
            multiple yield sources into optimized, automated strategies that maximize your returns.
          </motion.p>

          {/* Advantages Grid */}
          <div className="grid md:grid-cols-3 gap-4 md:gap-6 mb-6">
            {advantages.map((advantage, index) => (
              <motion.div
                key={advantage.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
                className={cn(
                  "relative p-4 rounded-xl",
                  "backdrop-blur-sm border",
                  effectiveTheme === "light"
                    ? "bg-white/40 border-purple-200/30 hover:bg-white/50"
                    : "bg-white/5 border-purple-500/20 hover:bg-white/10",
                  "transition-all duration-300 hover:scale-105",
                  "group cursor-pointer"
                )}
              >
                {/* Icon */}
                <div className={cn(
                  "inline-flex items-center justify-center w-10 h-10 rounded-lg mb-3",
                  "bg-gradient-to-br from-purple-500 to-pink-500",
                  "group-hover:scale-110 transition-transform duration-300"
                )}>
                  <advantage.icon className="h-5 w-5 text-white" />
                </div>

                {/* Content */}
                <h3 className={cn(
                  "font-semibold text-sm md:text-base mb-2",
                  effectiveTheme === "light" ? "text-purple-900" : "text-white"
                )}>
                  {advantage.title}
                </h3>

                <p className={cn(
                  "text-xs md:text-sm leading-relaxed",
                  effectiveTheme === "light" ? "text-purple-700" : "text-purple-200"
                )}>
                  {advantage.description}
                </p>

                {/* Hover effect */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/0 to-pink-500/0 group-hover:from-purple-500/5 group-hover:to-pink-500/5 transition-all duration-300" />
              </motion.div>
            ))}
          </div>

          {/* Call to action */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.3 }}
            className="text-center"
          >
            <p className={cn(
              "text-xs md:text-sm",
              effectiveTheme === "light" ? "text-purple-600" : "text-purple-300"
            )}>
              💡 Supply your assets below to start earning boosted yields automatically
            </p>
          </motion.div>
        </div>

        {/* Mobile: Expandable content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="md:hidden overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-4">
                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={cn(
                    "p-3 rounded-lg text-center",
                    "backdrop-blur-sm border",
                    effectiveTheme === "light"
                      ? "bg-white/40 border-purple-200/30"
                      : "bg-white/5 border-purple-500/20"
                  )}>
                    <div className="text-lg font-bold text-purple-500">3x</div>
                    <div className={cn(
                      "text-xs",
                      effectiveTheme === "light" ? "text-purple-700" : "text-purple-300"
                    )}>
                      Yield Sources
                    </div>
                  </div>
                  <div className={cn(
                    "p-3 rounded-lg text-center",
                    "backdrop-blur-sm border",
                    effectiveTheme === "light"
                      ? "bg-white/40 border-purple-200/30"
                      : "bg-white/5 border-purple-500/20"
                  )}>
                    <div className="text-lg font-bold text-emerald-500">Auto</div>
                    <div className={cn(
                      "text-xs",
                      effectiveTheme === "light" ? "text-purple-700" : "text-purple-300"
                    )}>
                      Optimization
                    </div>
                  </div>
                </div>

                {/* Advantages List */}
                <div className="space-y-3">
                  {advantages.map((advantage, index) => (
                    <motion.div
                      key={advantage.title}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1, duration: 0.2 }}
                      className={cn(
                        "flex gap-3 p-3 rounded-lg",
                        "backdrop-blur-sm border",
                        effectiveTheme === "light"
                          ? "bg-white/30 border-purple-200/20"
                          : "bg-white/5 border-purple-500/20"
                      )}
                    >
                      <div className={cn(
                        "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                        "bg-gradient-to-br from-purple-500 to-pink-500"
                      )}>
                        <advantage.icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className={cn(
                          "font-medium text-sm mb-1",
                          effectiveTheme === "light" ? "text-purple-900" : "text-white"
                        )}>
                          {advantage.title}
                        </h4>
                        <p className={cn(
                          "text-xs leading-relaxed",
                          effectiveTheme === "light" ? "text-purple-700" : "text-purple-200"
                        )}>
                          {advantage.description}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Call to action */}
                <div className="text-center pt-2">
                  <p className={cn(
                    "text-xs",
                    effectiveTheme === "light" ? "text-purple-600" : "text-purple-300"
                  )}>
                    💡 Supply assets below for boosted yields
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
