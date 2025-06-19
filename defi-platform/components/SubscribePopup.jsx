"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { X } from "lucide-react"

export function SubscribePopup() {
  const [isVisible, setIsVisible] = useState(false)
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState("idle") // idle, loading, success, error
  const [message, setMessage] = useState("")
  const [hasSubscribed, setHasSubscribed] = useState(false)

  // Show popup after 3 seconds
  useEffect(() => {
    // Check if user has already subscribed
    const subscribed = localStorage.getItem("peridot_subscribed")
    if (subscribed) {
      setHasSubscribed(true)
      return
    }

    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  const handleClose = () => {
    setIsVisible(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!email || !email.includes("@")) {
      setStatus("error")
      setMessage("Please enter a valid email address")
      return
    }

    setStatus("loading")
    
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to subscribe")
      }

      setStatus("success")
      setMessage("Thank you for subscribing!")
      localStorage.setItem("peridot_subscribed", "true")
      
      // Auto close after success
      setTimeout(() => {
        setIsVisible(false)
      }, 2000)
    } catch (error) {
      setStatus("error")
      setMessage(error.message || "Something went wrong. Please try again.")
    }
  }

  // Don't render anything if user already subscribed
  if (hasSubscribed) {
    return null
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            // Close when clicking the backdrop
            if (e.target === e.currentTarget) {
              handleClose()
            }
          }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-card border border-border/50 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl relative"
          >
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 text-text/60 hover:text-text transition-colors"
              aria-label="Close popup"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className="h-6 w-6 text-primary"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Be the First to Know</h3>
              <p className="text-text/70">
                Join our waitlist to get early access when Peridot launches. Be among the first to experience our cross-chain DeFi platform.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  type="email"
                  placeholder="Your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full"
                  disabled={status === "loading" || status === "success"}
                />
              </div>

              {message && (
                <div className={`text-sm ${status === "error" ? "text-red-500" : "text-green-500"}`}>
                  {message}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-primary text-background hover:bg-primary/90"
                disabled={status === "loading" || status === "success"}
              >
                {status === "loading" ? "Subscribing..." : status === "success" ? "Subscribed!" : "Get Early Access"}
              </Button>

              <div className="text-xs text-center text-text/60 mt-4">
                We'll never share your email with anyone else.
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
} 