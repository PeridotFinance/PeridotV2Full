"use client"


import React, { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Lock, ArrowRight, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"

import Image from "next/image"

interface PasswordProtectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  targetNetworkName: string
}

export function PasswordProtectionModal({
  isOpen,
  onClose,
  onSuccess,
  targetNetworkName
}: PasswordProtectionModalProps) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [shake, setShake] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  
  // Mascot state to provide visual feedback
  const [mascotState, setMascotState] = useState<'idle' | 'thinking' | 'success' | 'error'>('idle')

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPassword("")
      setError(false)
      setShake(false)
      setIsLoading(false)
      setMascotState('idle')
    }
  }, [isOpen])

  // Watch password input to change mascot state
  useEffect(() => {
    if (password.length > 0 && !isLoading && !error) {
      setMascotState('thinking')
    } else if (password.length === 0 && !isLoading && !error) {
      setMascotState('idle')
    }
  }, [password, isLoading, error])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setIsLoading(true)
    setError(false)
    setMascotState('thinking')
    
    try {
      // Simulate thinking time for better UX
      await new Promise(resolve => setTimeout(resolve, 800))

      const response = await fetch('/api/user/redeem-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: password, type: 'network_access' })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        setMascotState('success')
        // Small delay to show success state before closing
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1000)
      } else {
        throw new Error('Invalid password')
      }
    } catch (err) {
      setError(true)
      setShake(true)
      setMascotState('error')
      setTimeout(() => setShake(false), 500)
    } finally {
      setIsLoading(false)
    }
  }

  // Determine which mascot image to show based on state
  const getMascotImage = () => {
    switch (mascotState) {
      case 'success':
        return "/Owl Mascot - Mint Green.svg"
      case 'error':
        return "/Owl Mascot - Colored.svg" // Maybe use a different color/expression if available, defaulting to colored for "alert"
      case 'thinking':
        return "/Owl Mascot - Bitcoin - Colored.svg"
      default:
        return "/Owl Mascot - Bitcoin - Mint Green.svg"
    }
  }

  // Determine message based on state
  const getMessage = () => {
    switch (mascotState) {
      case 'success':
        return "Welcome to the future! Access granted."
      case 'error':
        return "Hoot! That password doesn't look right."
      case 'thinking':
        return "Let me check that for you..."
      default:
        return `The ${targetNetworkName} is currently in early access.`
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md border-0 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden rounded-3xl">
        {/* Decorative background elements */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 blur-3xl rounded-full" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-accent/10 blur-3xl rounded-full" />
        
        <DialogHeader className="space-y-4 relative z-10 flex flex-col items-center">
          <div className={cn(
            "relative w-32 h-32 transition-all duration-500 ease-in-out transform",
            mascotState === 'thinking' && "scale-110",
            mascotState === 'success' && "scale-110 rotate-6",
            mascotState === 'error' && "rotate-[-6deg]"
          )}>
            <Image 
              src={getMascotImage()} 
              alt="Peridot Mascot" 
              fill 
              className="object-contain drop-shadow-2xl"
              priority
            />
          </div>
          
          <div className="text-center space-y-2">
            <DialogTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
              {mascotState === 'success' ? 'Access Unlocked!' : 'Restricted Access'}
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground text-base max-w-[80%] mx-auto">
              {getMessage()}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4 relative z-10 px-4 pb-4">
          <div className={cn("space-y-2 relative transition-all", shake && "animate-shake")}>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(false)
                }}
                className={cn(
                  "pr-10 h-12 bg-white/5 border-white/10 focus:border-primary/50 focus:ring-primary/20 transition-all text-center text-lg tracking-widest placeholder:tracking-normal placeholder:text-muted-foreground/50 rounded-2xl",
                  error && "border-red-500/50 focus:border-red-500 focus:ring-red-500/20"
                )}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-primary transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-500 text-center animate-in fade-in slide-in-from-top-1 font-medium">
                Incorrect password. Please try again.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              className="flex-1 h-11 border-white/10 hover:bg-white/5 hover:text-primary transition-colors rounded-2xl"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="flex-1 h-11 bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity shadow-lg shadow-primary/20 rounded-2xl"
              disabled={!password || isLoading}
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              ) : (
                <>
                  Unlock Access
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

