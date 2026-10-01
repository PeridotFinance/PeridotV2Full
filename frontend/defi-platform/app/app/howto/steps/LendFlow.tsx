"use client"

import { motion, AnimatePresence } from "framer-motion"
import { playThump, playAction, playSuccess } from "@/lib/sound"
import { Stage } from "./Stage"
import { useReducedMotion } from "@/lib/use-reduced-motion"

export default function LendFlow({ step }: { step: number }) {
  const { isLowPerfDevice } = useReducedMotion()
  const copy = [
    { title: "Pick asset", text: "Choose what to lend out." },
    { title: "Set lend", text: "Decide how much to lend." },
    { title: "Earn interest", text: "Receive yield automatically." },
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
                const emoji = step === 1 ? "🧾" : step === 2 ? "🔑" : "🔐"
                if (isLowPerfDevice) {
                  return <span className="text-3xl" aria-hidden>{emoji}</span>
                }
                if (step === 1) {
                  return (
                    <motion.span
                      className="text-3xl md:text-4xl"
                      aria-hidden
                      initial={{ y: -10, rotate: -6, scale: 0.92 }}
                      animate={{ y: [ -10, 0, -2, 0 ], rotate: 0, scale: [0.92, 1, 1.02, 1] }}
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
                      initial={{ x: -8, rotate: -20, opacity: 0.9 }}
                      animate={{ x: [ -8, 0 ], rotate: 0, opacity: 1 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    >
                      {emoji}
                    </motion.span>
                  )
                }
                return (
                  <motion.span
                    className="text-3xl md:text-4xl"
                    aria-hidden
                    initial={{ y: -12, scale: 0.9, rotate: -8 }}
                    animate={{ y: [ -12, 0, -2, 0 ], scale: [0.9, 1, 1.02, 1], rotate: 0 }}
                    transition={{ duration: 0.55, ease: "easeOut" }}
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


