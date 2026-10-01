'use client'

import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { FEATURE_FLAGS } from '@/config/featureFlags'
import { Button } from '@/components/ui/button'
import { X, Zap, Star, Trophy } from 'lucide-react'

interface ActionRewardPopupProps {
  isOpen: boolean
  onClose: () => void
  actionType: 'supply' | 'borrow' | 'repay' | 'redeem'
  tokenSymbol?: string
}

const actionCopy: Record<ActionRewardPopupProps['actionType'], { title: string; accent: string }> = {
  supply: { title: 'Supply successful', accent: 'from-emerald-400/25 via-green-500/20 to-cyan-500/20' },
  borrow: { title: 'Borrow successful', accent: 'from-cyan-400/25 via-blue-500/20 to-indigo-500/20' },
  repay: { title: 'Repay successful', accent: 'from-amber-400/25 via-orange-500/20 to-pink-500/20' },
  redeem: { title: 'Withdraw successful', accent: 'from-purple-400/25 via-fuchsia-500/20 to-pink-500/20' },
}

export function ActionRewardPopup({ isOpen, onClose, actionType, tokenSymbol }: ActionRewardPopupProps) {
  if (FEATURE_FLAGS.INTERACTIVE_TX_DIALOG) return null
  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [isOpen, onClose])

  const copy = actionCopy[actionType]

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="max-w-sm border-none bg-transparent shadow-none p-0">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 24 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26, duration: 0.45 }}
              className="relative"
            >
              {/* Glass gradient background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${copy.accent} rounded-2xl backdrop-blur-2xl border border-white/20 shadow-xl`} />

              {/* Subtle floating particles */}
              <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1.5 h-1.5 bg-white/30 rounded-full"
                    initial={{ x: Math.random() * 240, y: Math.random() * 180, opacity: 0 }}
                    animate={{ x: Math.random() * 240, y: Math.random() * 180, opacity: [0, 1, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.25, ease: 'easeInOut' }}
                  />
                ))}
              </div>

              {/* Content */}
              <div className="relative p-6 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 border-0"
                >
                  <X className="h-4 w-4" />
                </Button>

                <div className="flex justify-center mb-3">
                  <motion.div animate={{ rotate: [0, 8, -8, 0] }} transition={{ duration: 1.8, repeat: Infinity }} className="relative">
                    <Zap className="h-10 w-10 text-yellow-300 drop-shadow" />
                    <motion.div
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{ duration: 1.4, repeat: Infinity }}
                      className="absolute -inset-2 bg-yellow-300/20 rounded-full blur-lg"
                    />
                  </motion.div>
                </div>

                <div className="text-white text-lg font-semibold">
                  {copy.title}{tokenSymbol ? ` · ${tokenSymbol}` : ''}
                </div>
                <div className="text-white/80 text-sm mt-1 flex items-center justify-center gap-1">
                  <Star className="h-4 w-4 text-yellow-300" />
                  You earned Peridot points!
                </div>

                <div className="mt-4 flex items-center justify-center gap-2">
                  <Button
                    onClick={onClose}
                    className="bg-white/15 hover:bg-white/25 text-white rounded-xl"
                  >
                    Nice!
                  </Button>
                  <Button
                    onClick={() => { onClose(); window.location.assign('/app/leaderboard') }}
                    className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl"
                  >
                    <Trophy className="h-4 w-4 mr-1" /> View leaderboard
                  </Button>
                </div>
              </div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  )
}

export default ActionRewardPopup


