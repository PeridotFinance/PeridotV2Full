import React from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Comprehensive error logging for production debugging
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorName: error.name,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      viewport: typeof window !== 'undefined' ? {
        width: window.innerWidth,
        height: window.innerHeight
      } : null,
    }
    
    console.error('[ErrorBoundary] Caught error:', errorDetails)
    console.error('[ErrorBoundary] Full error object:', error)
    console.error('[ErrorBoundary] Error info:', errorInfo)
    
    // Try to log to console in a way that's visible even in minified production
    try {
      console.group('🚨 CRITICAL ERROR - Landing Page Crash')
      console.error('Error Message:', error.message)
      console.error('Error Stack:', error.stack)
      console.error('Component Stack:', errorInfo.componentStack)
      console.error('User Agent:', errorDetails.userAgent)
      console.error('Viewport:', errorDetails.viewport)
      console.error('Timestamp:', errorDetails.timestamp)
      console.groupEnd()
    } catch (e) {
      // Fallback if console.group is not available
      console.error('ERROR:', JSON.stringify(errorDetails, null, 2))
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Failed to load component. Please refresh the page.
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

    return this.props.children
  }
}
