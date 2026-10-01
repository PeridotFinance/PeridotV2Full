"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ErrorModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  message: string
  details?: string
  onRetry?: () => void
  isRetryable?: boolean
}

export const ErrorModal = ({
  isOpen,
  onClose,
  title = "Transaction Failed",
  message,
  details,
  onRetry,
  isRetryable = false,
}: ErrorModalProps) => {
  const [showDetails, setShowDetails] = useState(false)

  // Reset showDetails when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDetails(false)
    }
  }, [isOpen])

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape, { passive: true })
      document.body.style.overflow = 'hidden'
      
      return () => {
        document.removeEventListener('keydown', handleEscape)
        document.body.style.overflow = 'unset'
      }
    }
  }, [isOpen, onClose])

  // Format error message for better readability
  const formatErrorMessage = (error: string): string => {
    if (!error || typeof error !== 'string') return 'An unexpected error occurred'
    
    // Limit length to prevent performance issues
    const safeError = error.length > 500 ? error.substring(0, 500) + '...' : error
    
    // Handle specific error types with user-friendly messages
    if (safeError.includes('Internal JSON-RPC error')) {
      return 'Network error occurred. This is usually temporary - please wait a moment and try again.'
    }
    
    if (safeError.includes('ContractFunctionExecutionError') && safeError.includes('mint')) {
      return 'Supply transaction failed. This could be due to insufficient liquidity in the market or network congestion. Please try again with a smaller amount or wait a few moments.'
    }
    
    if (safeError.includes('execution reverted:')) {
      const revertReason = safeError.split('execution reverted:')[1]?.split('Contract Call:')[0]?.trim()
      if (revertReason) {
        return revertReason.length > 200 ? revertReason.substring(0, 200) + '...' : revertReason
      }
    }
    
    if (safeError.includes('insufficient allowance')) {
      return 'Insufficient token allowance. Please try the transaction again.'
    }
    
    if (safeError.includes('User rejected')) {
      return 'Transaction was cancelled by user.'
    }
    
    if (safeError.includes('rate limited')) {
      return 'Temporarily rate limited. Please wait 30–60 seconds, then try again.'
    }
    
    if (safeError.includes('timeout')) {
      return 'Transaction timed out. Please check your connection and try again.'
    }
    
    return safeError
  }

  const formatDetails = (error: string): string => {
    if (!error || typeof error !== 'string') return 'No error details available'
    
    // Limit very large error messages to prevent browser freezing
    if (error.length > 5000) {
      return error.substring(0, 5000) + '\n\n... (Error message truncated for performance)'
    }
    
    return error
  }

  // Get helpful suggestions based on error type
  const getSuggestions = (error: string): string[] => {
    const suggestions: string[] = []
    
    if (error.includes('Internal JSON-RPC error')) {
      suggestions.push('Wait 30-60 seconds and try again')
      suggestions.push('Check your internet connection')
      suggestions.push('Try refreshing the page')
    } else if (error.includes('mint') && error.includes('reverted')) {
      suggestions.push('Try with a smaller amount')
      suggestions.push('Wait a few minutes for market conditions to improve')
      suggestions.push('Check if the market is still accepting deposits')
    } else if (error.includes('rate limited')) {
      suggestions.push('Wait 30-60 seconds before retrying')
      suggestions.push('Avoid rapid successive transactions')
    } else if (error.includes('timeout')) {
      suggestions.push('Check your internet connection')
      suggestions.push('Try increasing gas fees if available')
      suggestions.push('Wait a moment and try again')
    } else {
      suggestions.push('Try the transaction again')
      suggestions.push('Check your wallet connection')
      suggestions.push('Ensure you have sufficient balance')
    }
    
    return suggestions
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto scrollbar-hide"
          onClick={onClose}
        >
          {/* Backdrop with glassmorphism */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          
          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: [0.4, 0.0, 0.2, 1] }}
            className="relative w-full max-w-md mx-auto max-h-[calc(100vh-2rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative backdrop-blur-xl bg-gradient-to-br from-white/10 via-white/5 to-transparent border border-red-500/20 rounded-2xl shadow-2xl overflow-hidden max-h-[calc(100vh-2rem)]">
              {/* Gradient overlay for depth */}
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-red-600/5" />
              
              {/* Content */}
              <div className="relative p-6 space-y-4 overflow-y-auto scrollbar-hide max-h-[calc(100vh-2rem)]">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                      className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center"
                    >
                      <AlertTriangle className="h-6 w-6 text-red-500" />
                    </motion.div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">{title}</h3>
                      <p className="text-sm text-red-400">Something went wrong</p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-muted-foreground hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Error Message */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-3"
                >
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                    <p className="text-red-100 text-sm leading-relaxed">
                      {formatErrorMessage(message)}
                    </p>
                  </div>

                  {/* Technical Details (collapsible) */}
                  {details && (
                    <div className="space-y-2">
                      <button
                        onClick={() => setShowDetails(!showDetails)}
                        className="text-xs text-muted-foreground hover:text-white transition-colors underline"
                      >
                        {showDetails ? 'Hide' : 'Show'} technical details
                      </button>
                      
                      <AnimatePresence>
                        {showDetails && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="bg-muted/10 border border-white/10 rounded-lg p-3 max-h-48 overflow-y-auto">
                              <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-mono">
                                {formatDetails(details)}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>

                {/* Helpful Suggestions */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="space-y-2"
                >
                  <h4 className="text-sm font-medium text-white">What you can try:</h4>
                  <ul className="space-y-1">
                    {getSuggestions(details || message).map((suggestion, index) => (
                      <li key={index} className="text-sm text-muted-foreground flex items-start space-x-2">
                        <span className="text-blue-400 mt-1">•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>

                {/* Actions */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex gap-3 pt-2"
                >
                  {isRetryable && onRetry && (
                    <Button
                      onClick={onRetry}
                      className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0"
                    >
                      Try Again
                    </Button>
                  )}
                  <Button
                    onClick={onClose}
                    className={`${isRetryable && onRetry ? 'flex-1' : 'w-full'} bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white border-0`}
                  >
                    Dismiss
                  </Button>
                  <Button
                    onClick={async () => {
                      try {
                        // Copy error to clipboard for support
                        await navigator.clipboard.writeText(details || message)
                      } catch (error) {
                        // Fallback for older browsers or permission issues
                        console.warn('Could not copy to clipboard:', error)
                      }
                      onClose()
                    }}
                    variant="outline"
                    className="border-white/10 bg-white/5 hover:bg-white/10 text-white"
                  >
                    Copy Error
                  </Button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
} 
