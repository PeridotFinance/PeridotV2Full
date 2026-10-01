"use client"

import { AnimatePresence, motion } from "framer-motion"
import ExpertView from "@/components/app/ExpertView"
import EasyView from "@/components/app/EasyView"
import { ModeIntroDialog } from "@/components/app/ModeIntroDialog"
import { useViewMode } from "@/context/view-mode"

export default function AppPage() {
  const { mode } = useViewMode()

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        >
          {mode === "easy" ? <EasyView /> : <ExpertView />}
        </motion.div>
      </AnimatePresence>
      <ModeIntroDialog />
    </>
  )
}
