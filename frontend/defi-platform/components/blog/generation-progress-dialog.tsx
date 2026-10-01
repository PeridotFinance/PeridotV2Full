"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, CheckCircle2, Circle, Sparkles } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

export type GenerationStep =
  | "topic-plan"
  | "base-info"
  | "generate-outline"
  | "article-content"
  | "interactive-blocks"
  | "section-images"
  | "meta-info"
  | "faq"
  | "cover-image"
  | "concept-image"
  | "explanations"
  | "fact-check"
  | "complete"

export interface StepStatus {
  step: GenerationStep
  status: "pending" | "in-progress" | "completed" | "error"
  message?: string
  error?: string
}

interface GenerationProgressDialogProps {
  open: boolean
  steps: StepStatus[]
  currentStep?: GenerationStep
}

const stepLabels: Record<GenerationStep, string> = {
  "topic-plan":        "Validating Topic",
  "base-info":         "Generating Metadata",
  "generate-outline":  "Building Narrative Outline",
  "article-content":   "Writing Long-Form Article",
  "interactive-blocks": "Placing Interactive Components",
  "section-images":    "Generating Section Illustrations",
  "meta-info":         "Optimizing SEO",
  "faq":               "Creating FAQ",
  "cover-image":       "Generating Cover Image",
  "concept-image":     "Creating Concept Visual",
  "explanations":      "Adding Explanations",
  "fact-check":        "Fact-Checking Content",
  "complete":          "Complete",
}

const stepDescriptions: Record<GenerationStep, string> = {
  "topic-plan":        "Analyzing topic relevance and alignment",
  "base-info":         "Creating title, slug, and metadata",
  "generate-outline":  "Designing section-by-section narrative arc",
  "article-content":   "Writing deep, long-form educational content",
  "interactive-blocks": "Selecting hands-on learning components",
  "section-images":    "Generating one AI illustration per section",
  "meta-info":         "Crafting SEO-optimized meta tags",
  "faq":               "Generating frequently asked questions",
  "cover-image":       "Designing cover image with AI",
  "concept-image":     "Creating visual concept diagram",
  "explanations":      "Identifying complex concepts for deeper explanations",
  "fact-check":        "Verifying factual claims",
  "complete":          "All steps completed successfully",
}

export function GenerationProgressDialog({
  open,
  steps,
  currentStep,
}: GenerationProgressDialogProps) {
  const [pulseIndex, setPulseIndex] = useState(0)

  useEffect(() => {
    if (!open) return
    const interval = setInterval(() => {
      setPulseIndex((prev) => (prev + 1) % 3)
    }, 600)
    return () => clearInterval(interval)
  }, [open])

  const completedSteps = steps.filter((s) => s.status === "completed").length
  const totalSteps = steps.length
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            Generating Article
          </DialogTitle>
          <DialogDescription>
            Creating your blog article with AI assistance
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Steps List */}
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {steps.map((stepStatus, index) => {
                const isActive = stepStatus.step === currentStep
                const isCompleted = stepStatus.status === "completed"
                const isError = stepStatus.status === "error"
                const isPending = stepStatus.status === "pending"

                return (
                  <motion.div
                    key={stepStatus.step}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className={`
                      flex items-start gap-3 p-3 rounded-lg border transition-all
                      ${
                        isActive
                          ? "border-primary/50 bg-primary/5 shadow-sm"
                          : isCompleted
                          ? "border-green-500/30 bg-green-500/5"
                          : isError
                          ? "border-destructive/30 bg-destructive/5"
                          : "border-border/50 bg-muted/30"
                      }
                    `}
                  >
                    {/* Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {isCompleted ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        >
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        </motion.div>
                      ) : isError ? (
                        <Circle className="h-5 w-5 text-destructive" />
                      ) : isActive ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <Loader2 className="h-5 w-5 text-primary" />
                        </motion.div>
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`
                            text-sm font-medium
                            ${isActive ? "text-foreground" : isCompleted ? "text-green-600" : isError ? "text-destructive" : "text-muted-foreground"}
                          `}
                        >
                          {stepLabels[stepStatus.step]}
                        </p>
                        {isActive && (
                          <motion.div
                            className="flex gap-1"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                          >
                            {[0, 1, 2].map((i) => (
                              <motion.div
                                key={i}
                                className="w-1.5 h-1.5 rounded-full bg-primary"
                                animate={{
                                  scale: pulseIndex === i ? [1, 1.3, 1] : 1,
                                  opacity: pulseIndex === i ? [0.5, 1, 0.5] : 0.5,
                                }}
                                transition={{ duration: 0.6, repeat: Infinity }}
                              />
                            ))}
                          </motion.div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stepStatus.message ||
                          stepStatus.error ||
                          stepDescriptions[stepStatus.step]}
                      </p>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

