"use client"

export function BridgeErrorFallback() {
  return (
    <div className="w-full max-w-5xl mx-auto mt-8 p-4">
      <div className="text-center p-8">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          The bridge encountered an error. Please refresh the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Refresh Page
        </button>
      </div>
    </div>
  )
}

