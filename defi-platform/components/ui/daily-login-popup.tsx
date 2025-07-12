'use client'

import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { X, Star, Gift, Calendar, Zap, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface DailyLoginPopupProps {
  isOpen: boolean
  onClose: () => void
  points: number
  loginStreak: number
  isNewUser?: boolean
  userName?: string
}

export function DailyLoginPopup({
  isOpen,
  onClose,
  points,
  loginStreak,
  isNewUser = false,
  userName
}: DailyLoginPopupProps) {
  const router = useRouter()

  // Auto close after 8 seconds
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose()
      }, 8000)
      
      return () => clearTimeout(timer)
    }
  }, [isOpen, onClose])

  const handleGoToLeaderboard = () => {
    onClose()
    router.push('/app/leaderboard')
  }

  const getStreakMessage = (streak: number) => {
    if (streak === 1) return "First login!"
    if (streak < 7) return `${streak} day streak!`
    if (streak < 30) return `${streak} day streak! Amazing!`
    return `${streak} day streak! Legendary!`
  }

  const getStreakEmoji = (streak: number) => {
    if (streak === 1) return "🎉"
    if (streak < 7) return "🔥"
    if (streak < 30) return "⚡"
    return "👑"
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="max-w-md border-none bg-transparent shadow-none p-0">
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 50 }}
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 30,
                duration: 0.5
              }}
              className="relative"
            >
              {/* Background with gradient and blur */}
              <div className="absolute inset-0 bg-gradient-to-br from-green-400/20 via-emerald-500/20 to-blue-500/20 rounded-3xl backdrop-blur-xl border border-white/30 shadow-2xl" />
              
              {/* Animated background sparkles */}
              <div className="absolute inset-0 overflow-hidden rounded-3xl">
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 bg-white/40 rounded-full"
                    initial={{ 
                      x: Math.random() * 300, 
                      y: Math.random() * 400,
                      scale: 0 
                    }}
                    animate={{ 
                      x: Math.random() * 300, 
                      y: Math.random() * 400,
                      scale: [0, 1, 0] 
                    }}
                    transition={{ 
                      duration: 2, 
                      repeat: Infinity, 
                      delay: i * 0.2,
                      ease: "easeInOut"
                    }}
                  />
                ))}
              </div>

              {/* Content */}
              <div className="relative p-8 text-center">
                {/* Close button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 border-0"
                >
                  <X className="h-4 w-4" />
                </Button>

                {/* Header */}
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="mb-6"
                >
                  <div className="flex justify-center mb-4">
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="relative"
                    >
                      <Gift className="h-16 w-16 text-yellow-400 drop-shadow-lg" />
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="absolute -inset-2 bg-yellow-400/20 rounded-full blur-xl"
                      />
                    </motion.div>
                  </div>
                  
                  <DialogTitle className="text-2xl font-bold text-white mb-2">
                    {isNewUser ? "Welcome to Peridot!" : "Welcome Back!"}
                  </DialogTitle>
                  
                  {userName && (
                    <p className="text-white/80 text-sm">
                      {userName.slice(0, 6)}...{userName.slice(-4)}
                    </p>
                  )}
                </motion.div>

                {/* Points awarded */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
                  className="mb-6"
                >
                  <div className="relative inline-block">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-2xl p-6 shadow-xl"
                    >
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <Zap className="h-6 w-6 text-white" />
                        <span className="text-3xl font-bold text-white">+{points}</span>
                        <Star className="h-6 w-6 text-white" />
                      </div>
                      <p className="text-white/90 text-sm font-medium">Points Earned</p>
                    </motion.div>
                    
                    {/* Floating particles */}
                    {[...Array(4)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-1 h-1 bg-yellow-300 rounded-full"
                        initial={{ x: 0, y: 0, opacity: 1 }}
                        animate={{ 
                          x: (i % 2 ? 1 : -1) * (20 + i * 10), 
                          y: -30 - i * 10, 
                          opacity: 0 
                        }}
                        transition={{ 
                          duration: 1.5, 
                          repeat: Infinity, 
                          delay: i * 0.3 
                        }}
                      />
                    ))}
                  </div>
                </motion.div>

                {/* Login streak */}
                {loginStreak > 0 && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="mb-6"
                  >
                    <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/20">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <Calendar className="h-5 w-5 text-emerald-400" />
                        <span className="text-lg font-semibold text-white">
                          {getStreakEmoji(loginStreak)} {getStreakMessage(loginStreak)}
                        </span>
                      </div>
                      <p className="text-white/70 text-xs">
                        Keep logging in daily to maintain your streak!
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Action buttons */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="space-y-3"
                >
                  <Button
                    onClick={handleGoToLeaderboard}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-3 rounded-xl shadow-lg transition-all duration-300"
                  >
                    <Trophy className="h-4 w-4 mr-2" />
                    Continue to Leaderboard
                  </Button>
                  
                  <p className="text-white/60 text-xs">
                    Come back tomorrow for another bonus!
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  )
} 