"use client"

import { motion, AnimatePresence } from "framer-motion"
import { playThump, playAction, playSuccess } from "@/lib/sound"
import { Stage } from "./Stage"
import { useReducedMotion } from "@/lib/use-reduced-motion"

export default function EarnFlow({ step }: { step: number }) {
  const { isLowPerfDevice } = useReducedMotion()
  const copy = [
    { title: "Pick a token", text: "Choose what you want to grow." },
    { title: "Supply it", text: "Add it to the pool safely." },
    { title: "Earn rewards", text: "Watch points and yield roll in." },
  ][step - 1]

  return (
    <div className="text-center">
      <Stage>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ scale: 0.85, opacity: 0, y: 8, rotate: 6 }}
            animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            onAnimationStart={() => (step === 3 ? playSuccess() : playAction())}
            className="relative w-full h-full"
          >
            {/* Emoji glyph (per step) */}
            <div className="absolute inset-0 flex items-center justify-center select-none">
              {(() => {
                const emoji = step === 1 ? "🪙" : step === 2 ? "🫙" : "✨"
                if (isLowPerfDevice) {
                  return <span className="text-3xl" aria-hidden>{emoji}</span>
                }
                if (step === 1) {
                  return (
                    <motion.span
                      className="text-3xl md:text-4xl"
                      aria-hidden
                      initial={{ y: -16, scale: 0.9, rotate: -6 }}
                      animate={{ y: [ -16, 0, -2, 0 ], scale: [0.9, 1, 1.02, 1], rotate: 0 }}
                      transition={{ duration: 0.55, ease: "easeOut" }}
                    >
                      {emoji}
                    </motion.span>
                  )
                }
                if (step === 2) {
                  return (
                    <motion.span
                      className="text-3xl md:text-4xl"
                      aria-hidden
                      initial={{ y: 12, scale: 0.92, rotate: 6 }}
                      animate={{ y: [ 12, 0, -2, 0 ], scale: [0.92, 1, 1.02, 1], rotate: 0 }}
                      transition={{ duration: 0.55, ease: "easeOut" }}
                    >
                      {emoji}
                    </motion.span>
                  )
                }
                return (
                  <motion.span
                    className="text-3xl md:text-4xl"
                    aria-hidden
                    initial={{ scale: 0.9, rotate: -4, opacity: 0.95 }}
                    animate={{ scale: [0.9, 1, 1.06, 1], rotate: [ -4, 0, 2, 0 ], opacity: 1 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  >
                    {emoji}
                  </motion.span>
                )
              })()}
            </div>
          </motion.div>
        </AnimatePresence>
      </Stage>
      <div className="text-lg font-semibold mb-1">{copy.title}</div>
      <div className="text-text/70 text-sm">{copy.text}</div>
    </div>
  )
}


