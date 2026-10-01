
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface TourStep {
  elementId: string;
  title: string;
  content: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface FeatureTourProps {
  steps: TourStep[];
  isTourActive: boolean;
  currentStep: number;
  nextStep: () => void;
  prevStep: () => void;
  stopTour: () => void;
}

export const FeatureTour: React.FC<FeatureTourProps> = ({
  steps,
  isTourActive,
  currentStep,
  nextStep,
  prevStep,
  stopTour,
}) => {
  const step = steps[currentStep];
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const highlightBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step) {
      const element = document.getElementById(step.elementId);
      setTargetElement(element);
    }
  }, [step]);

  // If a step's target is missing, auto-skip after a delay to avoid blocking the tour
  // Give more time for the first step (wallet button) as it may take longer to render
  useEffect(() => {
    if (!isTourActive || !step) return
    const timeout = currentStep === 0 ? 2000 : 400 // 2s for first step, 400ms for others
    const handle = setTimeout(() => {
      const el = document.getElementById(step.elementId)
      if (!el) {
        if (currentStep < steps.length - 1) {
          nextStep()
        } else {
          stopTour()
        }
      }
    }, timeout)
    return () => clearTimeout(handle)
  }, [isTourActive, step, currentStep, steps.length, nextStep, stopTour])


  if (!isTourActive || !step) {
    return null;
  }

  // Find the target element directly in render to avoid race conditions
  const currentTargetElement = document.getElementById(step.elementId);
  if (!currentTargetElement) {
    return null;
  }

  const rect = currentTargetElement.getBoundingClientRect();
  // Responsive popover width: clamp to 90vw or 320px
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const computedWidth = Math.min(Math.max(280, Math.floor(viewportWidth * 0.9)), 320);
  // Prefer below the target; if near bottom of viewport, position above heuristically
  const placeAbove = rect.bottom > (typeof window !== 'undefined' ? window.innerHeight * 0.7 : 700);
  const top = placeAbove ? Math.max(8, rect.top - 10 - 180) : rect.bottom + 15;
  // Clamp left so popover stays on-screen
  const unclampedLeft = rect.left;
  const left = Math.max(8, Math.min(unclampedLeft, viewportWidth - computedWidth - 8));
  const popoverPosition = { top, left } as const;

  // Update the highlight box position
  if (highlightBoxRef.current) {
    highlightBoxRef.current.style.width = `${rect.width + 20}px`;
    highlightBoxRef.current.style.height = `${rect.height + 20}px`;
    highlightBoxRef.current.style.top = `${rect.top - 10}px`;
    highlightBoxRef.current.style.left = `${rect.left - 10}px`;
  }

  // Scroll element into view
  try {
    (currentTargetElement as any).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  } catch {
    currentTargetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-[100]"
        onClick={stopTour}
      />

      {/* Highlight Box */}
      <motion.div
        ref={highlightBoxRef}
        className="fixed border-2 border-green-400 border-dashed rounded-lg bg-green-400/10 z-[101] pointer-events-none transition-all duration-300 ease-in-out"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      />
      
      {/* Popover Content */}
      <motion.div
        className="fixed z-[102] bg-background border border-border rounded-lg shadow-2xl p-4"
        style={popoverPosition}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
      >
        <div style={{ width: computedWidth }} />
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <motion.img
              src="/Owl Mascot - Colored.svg"
              alt="Peridot Owl"
              width={28}
              height={28}
              className="drop-shadow"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.25 }}
            />
            <h3 className="font-bold text-lg text-green-400">{step.title}</h3>
          </div>
          <button onClick={stopTour} className="p-1 rounded-full hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="text-sm text-muted-foreground mb-4">
          {step.content}
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            Step {currentStep + 1} of {steps.length}
          </span>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={prevStep}
                className="px-3 py-1 text-sm border border-border rounded-md hover:bg-muted"
              >
                <ChevronLeft className="w-4 h-4 inline-block mr-1" />
                Back
              </button>
            )}
            <button
              onClick={nextStep}
              className="px-3 py-1 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center"
            >
              {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
              <ChevronRight className="w-4 h-4 inline-block ml-1" />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}; 