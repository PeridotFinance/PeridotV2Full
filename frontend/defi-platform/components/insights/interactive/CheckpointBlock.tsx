"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { CheckpointOption } from "./types"

const LETTERS = ["A", "B", "C", "D", "E", "F"]

function getOptionModifier(
  index: number,
  selected: number | null,
  locked: boolean,
  correct: boolean
): string {
  if (!locked) return "iab__option--idle"
  if (index === selected) {
    return correct ? "iab__option--correct" : "iab__option--wrong"
  }
  if (correct) return "iab__option--correct-unselected"
  return "iab__option--idle-locked"
}

export function CheckpointBlock({
  question,
  options,
}: {
  question: string
  options: CheckpointOption[]
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)
  const [shaking, setShaking] = useState<number | null>(null)

  function handleSelect(index: number) {
    if (locked) return
    setSelected(index)
    setLocked(true)
    if (!options[index].correct) {
      setShaking(index)
      setTimeout(() => setShaking(null), 600)
    }
  }

  const selectedOption = selected !== null ? options[selected] : null

  return (
    <div className="iab iab--checkpoint">
      <p className="iab__eyebrow">
        <span className="iab__icon" aria-hidden="true">✏️</span>
        Knowledge Check
      </p>
      <p className="iab__question">{question}</p>
      <div className="iab__options" role="group" aria-label="Answer options">
        {options.map((option, i) => {
          const modifier = getOptionModifier(i, selected, locked, option.correct)
          const isShaking = shaking === i

          return (
            <motion.button
              key={i}
              type="button"
              className={`iab__option ${modifier}`}
              onClick={() => handleSelect(i)}
              disabled={locked}
              whileTap={!locked ? { scale: 0.97 } : {}}
              animate={
                isShaking
                  ? { x: [0, -8, 8, -6, 6, -3, 3, 0] }
                  : { x: 0 }
              }
              transition={
                isShaking
                  ? { duration: 0.5, ease: "easeInOut" }
                  : { duration: 0.15 }
              }
              aria-pressed={selected === i}
            >
              <span className="iab__option-marker" aria-hidden="true">
                {!locked
                  ? LETTERS[i] ?? String(i + 1)
                  : option.correct
                  ? "✓"
                  : selected === i
                  ? "✗"
                  : LETTERS[i] ?? String(i + 1)}
              </span>
              <span className="iab__option-text">{option.text}</span>
            </motion.button>
          )
        })}
      </div>

      <AnimatePresence>
        {locked && selectedOption && (
          <motion.div
            className={`iab__reveal ${selectedOption.correct ? "iab__reveal--correct" : "iab__reveal--wrong"}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="iab__reveal-inner">
              <span className="iab__reveal-icon" aria-hidden="true">
                {selectedOption.correct ? "✓" : "💡"}
              </span>
              <span>{selectedOption.explanation}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
