
import { useState, useEffect, useCallback } from 'react';

const TOUR_STORAGE_KEY = 'peridot-feature-tour-completed';

export const useFeatureTour = (totalSteps: number) => {
  const [isTourActive, setIsTourActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    try {
      const hasCompletedTour = localStorage.getItem(TOUR_STORAGE_KEY);
      if (hasCompletedTour !== 'true') {
        // Automatically start the tour for first-time visitors
        // Give time for dynamic components to load
        const timer = setTimeout(() => {
          setIsTourActive(true);
        }, 1500); 
        return () => clearTimeout(timer);
      }
    } catch (error) {
      console.error("Could not access localStorage:", error);
    }
  }, []);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsTourActive(true);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // End of tour
      setIsTourActive(false);
      try {
        localStorage.setItem(TOUR_STORAGE_KEY, 'true');
      } catch (error) {
        console.error("Could not access localStorage:", error);
      }
    }
  }, [currentStep, totalSteps]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const stopTour = useCallback(() => {
    setIsTourActive(false);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch (error) {
      console.error("Could not access localStorage:", error);
    }
  }, []);

  return {
    isTourActive,
    currentStep,
    startTour,
    nextStep,
    prevStep,
    stopTour,
    setCurrentStep,
  };
}; 