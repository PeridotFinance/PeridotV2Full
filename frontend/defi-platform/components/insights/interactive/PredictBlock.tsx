"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

export function PredictBlock({
  prompt,
  options,
  correctIndex,
  reveal,
}: {
  prompt: string
  options: string[]
  correctIndex: number
  reveal: string
}) {
  const [selected, setSelected] = useState<number | null>(null)

  function handleSelect(index: number) {
    if (selected !== null) return
    setSelected(index)
  }

  const isCorrect = selected !== null && selected === correctIndex
  const selectedText = selected !== null ? options[selected] : null

  return (
    <div className="iab iab--predict">
      <p className="iab__eyebrow">
        <span className="iab__icon" aria-hidden="true">🔮</span>
        Predict Before You Read
      </p>
      <p className="iab__question">{prompt}</p>
      <div className="iab__predict-options" role="group" aria-label="Prediction options">
        {options.map((option, i) => (
          <motion.button
            key={i}
            type="button"
            className={`iab__predict-option${selected === i ? " iab__predict-option--selected" : ""}`}
            onClick={() => handleSelect(i)}
            disabled={selected !== null}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {option}
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {selected !== null && (
          <motion.div
            className={`iab__reveal ${isCorrect ? "iab__reveal--correct" : "iab__reveal--wrong"}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="iab__reveal-inner">
              <span className="iab__reveal-icon" aria-hidden="true">
                {isCorrect ? "✓" : "💡"}
              </span>
              <div>
                <p className="iab__reveal-verdict">
                  {isCorrect
                    ? `✓ Right! ${reveal}`
                    : `💡 "${selectedText}" is a common assumption. Here's why it works differently: ${reveal}`}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
