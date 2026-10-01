'use client'

import React from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Badge as AchievementBadge } from '@/lib/achievements'
import { type AchievementContext } from '@/lib/achievement-progress'

interface NextBadgeCardProps {
  badge: AchievementBadge
  achievementContext: AchievementContext
  className?: string
}

export function NextBadgeCard({ badge, achievementContext, className }: NextBadgeCardProps) {

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl transition-all duration-300 ease-out",
        "bg-card/50 backdrop-blur-xl",
        "border border-border/40",
        "shadow-sm",
        "hover:shadow-md hover:border-border/60",
        className
      )}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/3 via-transparent to-teal-500/3 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* Subtle radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.06),transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Content */}
      <div className="relative p-6 sm:p-8">
        <div className="flex items-start gap-5 sm:gap-6">
          {/* Badge Icon */}
          <div className="relative flex-shrink-0">
            {/* Subtle glow */}
            <div className="absolute inset-0 rounded-xl blur-lg bg-emerald-500/10 transition-all duration-300" />
            
            {/* Icon container */}
            <div
              className={cn(
                "relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl",
                "bg-card/80 backdrop-blur-sm",
                "border border-border/30",
                "shadow-sm",
                "transition-all duration-300 group-hover:scale-[1.02]"
              )}
            >
              {/* Icon */}
              <div className="relative w-full h-full flex items-center justify-center text-3xl sm:text-4xl">
                {badge.icon}
              </div>
            </div>
          </div>

          {/* Badge Info */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-[0.15em]">
                  Next Badge
                </span>
                {badge.tier && (
                  <span className={cn(
                    "ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    "bg-muted/60 border border-border/30 text-muted-foreground",
                    "backdrop-blur-sm"
                  )}>
                    {badge.tier}
                  </span>
                )}
              </div>
              
              <h3 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
                {badge.name}
              </h3>
              
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                {badge.description}
              </p>
            </div>

            {/* Points reward indicator */}
            {badge.pointsReward && (
              <div className="flex items-center gap-2 pt-2">
                <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold text-sm">
                  +{badge.pointsReward} pts reward
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
        }
        
        .animate-shimmer {
          animation: shimmer 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

