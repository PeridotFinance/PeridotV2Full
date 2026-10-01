'use client'

import { motion } from 'framer-motion'
import { Bot } from 'lucide-react'

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="bg-muted/60 border border-border/40 rounded-2xl rounded-tl-none px-4 py-3">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-muted-foreground/50"
              animate={{ y: [0, -6, 0] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
