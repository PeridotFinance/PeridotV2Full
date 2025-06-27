"use client"

import { useState, useRef, ReactNode, ChangeEvent, FormEvent } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowRight, Users, CheckCircle, TrendingUp, Shield, Globe } from "lucide-react"
import { useReducedMotion } from "@/lib/use-reduced-motion"
import { useMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

// Re-use floating element animation component
const FloatingElement = ({ children, xOffset = 0, yOffset = 0, duration = 3 }: {
  children: ReactNode;
  xOffset?: number;
  yOffset?: number;
  duration?: number;
}) => {
  const { isLowPerfDevice } = useReducedMotion()

  if (isLowPerfDevice) {
    return <div style={{ transform: `translate(${xOffset}px, ${yOffset}px)` }}>{children}</div>
  }

  return (
    <motion.div
      animate={{
        y: [yOffset, yOffset - 15, yOffset],
        x: [xOffset, xOffset + 5, xOffset],
        rotate: [0, 2, 0],
      }}
      transition={{
        duration,
        repeat: Number.POSITIVE_INFINITY,
        repeatType: "reverse",
        ease: "easeInOut",
      }}
    >
      {children}
    </motion.div>
  )
}

// Magnetic button effect
const MagneticButton = ({ children, className }: { 
  children: ReactNode; 
  className?: string;
}) => {
  const { isLowPerfDevice } = useReducedMotion()

  if (isLowPerfDevice) {
    return (
      <div className={cn("relative", className)}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={cn("relative", className)}
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.2 }}
    >
      {children}
      <motion.div
        className="absolute -inset-4 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(127, 183, 113, 0.15) 0%, rgba(127, 183, 113, 0) 50%)",
          borderRadius: "50%",
          opacity: 0,
        }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
    </motion.div>
  )
}

// Form data type definition
interface WaitlistForm {
  name: string;
  email: string;
  expectedUsage: string;
}

export default function JoinWaitlist() {
  const { isLowPerfDevice } = useReducedMotion()
  const isMobile = useMobile()
  const [formState, setFormState] = useState<WaitlistForm>({
    name: "",
    email: "",
    expectedUsage: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState)
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to join waitlist');
      }
      
      setIsSubmitting(false)
      setIsSubmitted(true)
      setFormState({
        name: "",
        email: "",
        expectedUsage: "",
      })
    } catch (error) {
      console.error('Error joining waitlist:', error);
      alert('Failed to join waitlist. Please try again later.');
      setIsSubmitting(false)
    }
  }

  const features = [
    {
      icon: TrendingUp,
      title: "Early Access",
      description: "Be among the first to experience our DeFi platform"
    },
    {
      icon: Shield,
      title: "Priority Support", 
      description: "Get dedicated support and onboarding assistance"
    },
    {
      icon: Globe,
      title: "Exclusive Updates",
      description: "Receive insider updates on platform development"
    }
  ]

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-28 md:pt-40 pb-20 md:pb-32 overflow-hidden">
        {/* Dynamic background */}
        {!isLowPerfDevice && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5 z-0"
            style={{ scale: 1.1 }}
            transition={{ type: "spring", damping: 25, stiffness: 100 }}
          />
        )}

        {/* Floating elements */}
        {!isLowPerfDevice && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <FloatingElement xOffset={100} yOffset={100} duration={4}>
              <div className="w-64 h-64 rounded-full bg-primary/5 blur-3xl absolute top-1/4 -left-32" />
            </FloatingElement>

            <FloatingElement xOffset={-50} yOffset={300} duration={5}>
              <div className="w-96 h-96 rounded-full bg-accent/5 blur-3xl absolute bottom-0 right-0" />
            </FloatingElement>

            <FloatingElement xOffset={0} yOffset={200} duration={6}>
              <div className="w-32 h-32 rounded-full bg-secondary/10 blur-xl absolute top-1/3 right-1/4" />
            </FloatingElement>
          </div>
        )}

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          {/* Mobile Header Content */}
          <div className="lg:hidden text-center mb-8">
            <motion.div
              className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <Users className="w-4 h-4" />
              Join the Waitlist
            </motion.div>

            <motion.h1
              className="text-4xl md:text-5xl font-bold tracking-tight mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Get Early Access to{" "}
              <span className="gradient-text">Peridot</span>
            </motion.h1>

            <motion.p
              className="text-lg text-text/80 mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Join thousands of DeFi enthusiasts waiting for the future of cross-chain lending and borrowing.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Desktop Left Column - Content */}
            <div className="hidden lg:block text-left">
              <motion.div
                className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <Users className="w-4 h-4" />
                Join the Waitlist
              </motion.div>

              <motion.h1
                className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                Get Early Access to{" "}
                <span className="gradient-text">Peridot</span>
              </motion.h1>

              <motion.p
                className="text-lg md:text-xl text-text/80 mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                Join thousands of DeFi enthusiasts waiting for the future of cross-chain lending and borrowing.
                Be the first to experience simplified DeFi with smart rates and seamless cross-chain functionality.
              </motion.p>

              {/* Features */}
              <motion.div
                className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                {features.map((feature, index) => (
                  <div key={index} className="text-left">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{feature.title}</h3>
                    <p className="text-xs text-text/70">{feature.description}</p>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Form Column */}
            <motion.div
              className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-8 shadow-lg lg:col-start-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              {!isSubmitted ? (
                <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2">Join the Waitlist</h2>
                    <p className="text-text/70 text-sm">
                      Get notified when Peridot launches and receive exclusive early access
                    </p>
                  </div>

                  {/* Name Field */}
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="John Doe"
                      value={formState.name}
                      onChange={handleChange}
                      required
                      className="bg-background/80"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="john@example.com"
                      value={formState.email}
                      onChange={handleChange}
                      required
                      className="bg-background/80"
                    />
                  </div>



                  {/* Expected Usage */}
                  <div className="space-y-2">
                    <Label htmlFor="expectedUsage">How do you plan to use Peridot?</Label>
                    <Select onValueChange={(value) => handleSelectChange("expectedUsage", value)} required>
                      <SelectTrigger className="bg-background/80">
                        <SelectValue placeholder="Select your use case" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lending">Lending Assets</SelectItem>
                        <SelectItem value="borrowing">Borrowing Assets</SelectItem>
                        <SelectItem value="both">Both Lending & Borrowing</SelectItem>
                        <SelectItem value="integration">Platform Integration</SelectItem>
                        <SelectItem value="research">Research & Analysis</SelectItem>
                        <SelectItem value="trading">Trading & Arbitrage</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Submit Button */}
                  <MagneticButton className="w-full">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 h-auto"
                    >
                      {isSubmitting ? (
                        "Joining Waitlist..."
                      ) : (
                        <>
                          Join Waitlist
                          <ArrowRight className="ml-2 w-4 h-4" />
                        </>
                      )}
                    </Button>
                  </MagneticButton>

                  <p className="text-xs text-text/60 text-center">
                    By joining, you agree to receive updates about Peridot. We respect your privacy.
                  </p>
                </form>
              ) : (
                <div className="text-center py-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", duration: 0.5 }}
                    className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4"
                  >
                    <CheckCircle className="w-8 h-8 text-primary" />
                  </motion.div>
                  <h3 className="text-xl font-bold mb-2">Welcome to the Waitlist!</h3>
                  <p className="text-text/70 mb-4">
                    Thank you for joining. We'll notify you as soon as Peridot is available.
                  </p>
                  <Button
                    onClick={() => setIsSubmitted(false)}
                    variant="outline"
                    size="sm"
                  >
                    Join Another Person
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>


    </div>
  )
} 