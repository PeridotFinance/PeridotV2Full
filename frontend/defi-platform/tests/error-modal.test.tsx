import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ErrorModal } from '@/components/ui/error-modal'

// Mock framer-motion — factory is hoisted before imports so we must avoid JSX here
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => {
      const React = require('react')
      return React.createElement('div', props, children)
    },
  },
  AnimatePresence: ({ children }: any) => children,
}))

describe('ErrorModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    message: 'Test error message',
    details: 'Test error details',
  }

  it('should render when open', () => {
    render(<ErrorModal {...defaultProps} />)
    
    expect(screen.getByText('Transaction Failed')).toBeInTheDocument()
    expect(screen.getByText('Test error message')).toBeInTheDocument()
    expect(screen.getByText('Dismiss')).toBeInTheDocument()
  })

  it('should not render when closed', () => {
    render(<ErrorModal {...defaultProps} isOpen={false} />)
    
    expect(screen.queryByText('Transaction Failed')).not.toBeInTheDocument()
  })

  it('should show retry button when retryable', () => {
    const onRetry = vi.fn()
    render(
      <ErrorModal 
        {...defaultProps} 
        isRetryable={true} 
        onRetry={onRetry} 
      />
    )
    
    expect(screen.getByText('Try Again')).toBeInTheDocument()
  })

  it('should not show retry button when not retryable', () => {
    render(<ErrorModal {...defaultProps} isRetryable={false} />)
    
    expect(screen.queryByText('Try Again')).not.toBeInTheDocument()
  })

  it('should call onRetry when retry button is clicked', () => {
    const onRetry = vi.fn()
    render(
      <ErrorModal 
        {...defaultProps} 
        isRetryable={true} 
        onRetry={onRetry} 
      />
    )
    
    fireEvent.click(screen.getByText('Try Again'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('should call onClose when dismiss button is clicked', () => {
    const onClose = vi.fn()
    render(<ErrorModal {...defaultProps} onClose={onClose} />)
    
    fireEvent.click(screen.getByText('Dismiss'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should show helpful suggestions for JSON-RPC errors', () => {
    render(
      <ErrorModal 
        {...defaultProps} 
        message="Internal JSON-RPC error"
        details="Internal JSON-RPC error"
      />
    )
    
    expect(screen.getByText('What you can try:')).toBeInTheDocument()
    expect(screen.getByText('Wait 30-60 seconds and try again')).toBeInTheDocument()
    expect(screen.getByText('Check your internet connection')).toBeInTheDocument()
  })

  it('should show helpful suggestions for mint errors', () => {
    render(
      <ErrorModal 
        {...defaultProps} 
        message="mint reverted"
        details="mint reverted"
      />
    )
    
    expect(screen.getByText('What you can try:')).toBeInTheDocument()
    expect(screen.getByText('Try with a smaller amount')).toBeInTheDocument()
    expect(screen.getByText('Wait a few minutes for market conditions to improve')).toBeInTheDocument()
  })

  it('should toggle technical details', async () => {
    render(<ErrorModal {...defaultProps} />)
    
    const toggleButton = screen.getByText('Show technical details')
    expect(toggleButton).toBeInTheDocument()
    
    fireEvent.click(toggleButton)
    
    await waitFor(() => {
      expect(screen.getByText('Hide technical details')).toBeInTheDocument()
      expect(screen.getByText('Test error details')).toBeInTheDocument()
    })
  })

  it('should copy error to clipboard when copy button is clicked', async () => {
    // Mock clipboard API
    const mockWriteText = vi.fn()
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    })

    render(<ErrorModal {...defaultProps} />)
    
    const copyButton = screen.getByText('Copy Error')
    fireEvent.click(copyButton)
    
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('Test error details')
    })
  })
})





