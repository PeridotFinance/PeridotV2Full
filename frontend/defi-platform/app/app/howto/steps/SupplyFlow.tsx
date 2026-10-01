"use client"

import { motion, AnimatePresence } from "framer-motion"
import { playThump, playAction, playSuccess } from "@/lib/sound"
import { Stage } from "./Stage"
import { useReducedMotion } from "@/lib/use-reduced-motion"

export default function SupplyFlow({ step }: { step: number }) {
  const { isLowPerfDevice } = useReducedMotion()
  const copy = [
    { title: "Choose amount", text: "Use the slider to set it." },
    { title: "Confirm", text: "One tap and you're set." },
    { title: "Start earning", text: "Your balance grows over time." },
  ][step - 1]

  return (
    <div className="text-center">
      <Stage>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ scale: 0.85, opacity: 0, y: 8, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            onAnimationStart={() => (step === 3 ? playSuccess() : playAction())}
            className="relative w-full h-full"
          >
            {/* Emoji glyph (per step) */}
            <div className="absolute inset-0 flex items-center justify-center select-none">
              {(() => {
                const emoji = step === 1 ? "🔎" : step === 2 ? "👍" : "🌱"
                if (isLowPerfDevice) {
                  return <span className="text-3xl" aria-hidden>{emoji}</span>
                }
                if (step === 1) {
                  return (
                    <motion.span
                      className="text-3xl md:text-4xl"
                      aria-hidden
                      animate={{ scale: [1, 1.06, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
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
                      initial={{ scale: 0.92 }}
                      animate={{ scale: [0.92, 1.04, 1] }}
                      transition={{ duration: 0.5 }}
                    >
                      {emoji}
                    </motion.span>
                  )
                }
                return (
                  <motion.span
                    className="text-3xl md:text-4xl"
                    aria-hidden
                    animate={{ y: [0, -2, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
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


