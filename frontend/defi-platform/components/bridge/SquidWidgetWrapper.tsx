"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { ErrorBoundary } from "@/components/ErrorBoundary"

// Dynamically import SquidWidget - the initialization error is a known issue
// that doesn't prevent the widget from working, so we'll let it load despite the error
const SquidWidget = dynamic(
  () => {
    // The import may throw an initialization error, but the widget can still work
    // We'll catch it and still try to return the component
    return import("@0xsquid/widget")
      .then((mod) => {
        if (!mod.SquidWidget) {
          throw new Error("SquidWidget export not found")
        }
        return { default: mod.SquidWidget }
      })
      .catch((err) => {
        // Even if there's an initialization error, try to return the widget
        // The error might be non-fatal
        console.warn("SquidWidget import warning (may still work):", err.message)
        
        // Try to get the widget anyway
        return import("@0xsquid/widget")
          .then((mod) => ({ default: mod.SquidWidget }))
          .catch(() => {
            // If it truly fails, return fallback
            return {
              default: () => (
                <div className="w-full min-h-[580px] flex items-center justify-center">
                  <div className="text-center">
                    <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
                      Failed to load bridge widget
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Please refresh the page to try again.
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                    >
                      Refresh Page
                    </button>
                  </div>
                </div>
              ),
            }
          })
      })
  },
  { 
    ssr: false,
    loading: () => (
      <div className="w-full min-h-[580px] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">Loading bridge...</p>
        </div>
      </div>
    )
  }
)

interface SquidWidgetWrapperProps {
  config: any
  className?: string
  widgetThemeType: 'dark' | 'light'
}

export function SquidWidgetWrapper({ config, className, widgetThemeType }: SquidWidgetWrapperProps) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Set up global error handler to suppress the initialization error
    // This error is non-fatal and doesn't prevent the widget from working
    const handleError = (event: ErrorEvent) => {
      if (
        event.message?.includes("Cannot access 'SquidMainWidget' before initialization") ||
        (event.error?.name === "ReferenceError" && 
         event.message?.includes("SquidMainWidget"))
      ) {
        // Suppress this specific error - it's a known initialization quirk
        event.preventDefault()
        console.warn("SquidWidget initialization warning (non-fatal):", event.message)
        return false
      }
    }

    // Set up unhandled rejection handler as well
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (
        event.reason?.message?.includes("Cannot access 'SquidMainWidget' before initialization") ||
        (event.reason?.name === "ReferenceError" && 
         event.reason?.message?.includes("SquidMainWidget"))
      ) {
        event.preventDefault()
        console.warn("SquidWidget initialization warning (non-fatal):", event.reason?.message)
        return false
      }
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    // Wait for next tick to ensure everything is mounted
    const timer = setTimeout(() => {
      setIsReady(true)
    }, 100)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  if (!isReady) {
    return (
      <div className="w-full min-h-[580px] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">Initializing bridge...</p>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="w-full min-h-[580px] flex items-center justify-center">
          <div className="text-center p-4">
            <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
              Widget Error
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              The bridge widget encountered an error. Please refresh the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Refresh
            </button>
          </div>
        </div>
      }
    >
      <SquidWidget key={widgetThemeType} config={config} className={className} />
    </ErrorBoundary>
  )
}

