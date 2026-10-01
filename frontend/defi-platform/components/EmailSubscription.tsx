"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Mail } from "lucide-react"

interface EmailSubscriptionProps {
  variant?: "footer" | "popup"
  className?: string
  onSuccess?: () => void
}

export function EmailSubscription({ variant = "footer", className = "", onSuccess }: EmailSubscriptionProps) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState("idle") // idle, loading, success, error
  const [message, setMessage] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
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
      setEmail("")
      
      // Store subscription status to prevent popup from showing
      localStorage.setItem("peridot_subscribed", "true")

      // Trigger success callback if provided
      if (onSuccess) {
        setTimeout(() => {
          onSuccess()
        }, 2000)
      }
      
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.")
    }
  }

  if (variant === "footer") {
    return (
      <div className={`space-y-4 ${className}`}>
        <div>
          <h3 className="font-bold text-lg mb-2">Stay Updated</h3>
          <p className="text-text/70 text-sm">
            Get early access and updates about Peridot's launch.
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text/40" />
              <Input
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 w-full min-w-[200px] sm:min-w-[250px]"
                disabled={status === "loading" || status === "success"}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="px-6 whitespace-nowrap rounded-2xl"
              disabled={status === "loading" || status === "success"}
            >
              {status === "loading" ? "..." : status === "success" ? "✓" : "Subscribe"}
            </Button>
          </div>
          
          {message && (
            <div className={`text-xs ${status === "error" ? "text-red-500" : "text-green-500"}`}>
              {message}
            </div>
          )}
        </form>
      </div>
    )
  }

  // Popup variant (existing logic from SubscribePopup)
  return (
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
        className="w-full bg-primary text-background hover:bg-primary/90 rounded-2xl"
        disabled={status === "loading" || status === "success"}
      >
        {status === "loading" ? "Subscribing..." : status === "success" ? "Subscribed!" : "Get Early Access"}
      </Button>

      <div className="text-xs text-center text-text/60 mt-4">
        We'll never share your email with anyone else.
      </div>
    </form>
  )
}
