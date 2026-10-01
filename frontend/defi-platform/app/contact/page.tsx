"use client"

import { useState, useRef, ReactNode, ChangeEvent, FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useReducedMotion } from "@/lib/use-reduced-motion"
import { useMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

// Simple checkmark icon as SVG
const CheckCircle = () => (
  <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

// Simple arrow right icon
const ArrowRight = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
)

// Simple send icon
const Send = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
)

// Form data type definition
interface FormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export default function Contact() {
  const isMobile = useMobile()
  const [formState, setFormState] = useState<FormData>({
    name: "",
    email: "",
    subject: "",
    message: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormState((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState)
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }
      
      setIsSubmitting(false)
      setIsSubmitted(true)
      setFormState({
        name: "",
        email: "",
        subject: "",
        message: "",
      })
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again later.');
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative pt-28 md:pt-40 pb-20 md:pb-32 overflow-hidden">
        {/* Simple background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5 z-0" />

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex flex-col items-center justify-center text-center mb-12">
            <p className="text-primary font-medium tracking-wider">
              GET IN TOUCH
            </p>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
              Contact <span className="gradient-text">Peridot</span>
            </h1>

            <p className="text-lg md:text-xl text-text/80 max-w-2xl">
              Have questions about our platform or need assistance? We're here to help. 
              Fill out the form below and our team will get back to you shortly.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Contact Form */}
            <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-8 shadow-xl">
              {isSubmitted ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                  <div className="text-primary mb-6">
                    <CheckCircle />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">Message Sent Successfully!</h3>
                  <p className="text-text/70 mb-8 max-w-md">
                    Thank you for contacting us! We've received your message and our team will get back to you within 24-48 hours. 
                    We appreciate your interest in Peridot.
                  </p>
                  <Button 
                    onClick={() => setIsSubmitted(false)} 
                    className="border border-primary/20 hover:border-primary/40 bg-background hover:bg-accent hover:text-accent-foreground rounded-xl group"
                  >
                    Send Another Message
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name" className="text-sm font-medium">
                          Your Name
                        </Label>
                        <Input
                          id="name"
                          name="name"
                          value={formState.name}
                          onChange={handleChange}
                          placeholder="John Doe"
                          className="rounded-xl bg-background/50 border-border/50 focus:border-primary/50 transition-all duration-200"
                          required
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-medium">
                          Email Address
                        </Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          value={formState.email}
                          onChange={handleChange}
                          placeholder="john@example.com"
                          className="rounded-xl bg-background/50 border-border/50 focus:border-primary/50 transition-all duration-200"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject" className="text-sm font-medium">
                        Subject
                      </Label>
                      <Input
                        id="subject"
                        name="subject"
                        value={formState.subject}
                        onChange={handleChange}
                        placeholder="How can we help you?"
                        className="rounded-xl bg-background/50 border-border/50 focus:border-primary/50 transition-all duration-200"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message" className="text-sm font-medium">
                        Message
                      </Label>
                      <Textarea
                        id="message"
                        name="message"
                        value={formState.message}
                        onChange={handleChange}
                        placeholder="Tell us about your inquiry..."
                        className="min-h-32 rounded-xl bg-background/50 border-border/50 focus:border-primary/50 transition-all duration-200"
                        required
                      />
                    </div>
                  </div>

                  <div className="w-full sm:w-auto">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="h-11 rounded-md px-8 bg-primary text-background hover:bg-primary/90 rounded-xl group relative overflow-hidden w-full sm:w-auto"
                    >
                      <span className="relative z-10 flex items-center">
                        {isSubmitting ? "Sending..." : "Send Message"}
                        <div className="ml-2">
                          {isSubmitting ? <Send className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                        </div>
                      </span>
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Contact Information */}
            <div className="space-y-8">
              <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-8 shadow-xl">
                <h3 className="text-xl font-bold mb-6">Connect With Us</h3>
                <div className="flex space-x-4">
                  <a 
                    href="https://twitter.com/peridotprotocol" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-primary/10 hover:bg-primary/20 p-3 rounded-full transition-colors duration-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-primary">
                      <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path>
                    </svg>
                  </a>
                  <a 
                    href="https://t.me/peridotlabs" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-primary/10 hover:bg-primary/20 p-3 rounded-full transition-colors duration-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-primary">
                      <path d="M21.2 7.8C21.2 7.8 21.2 7.8 21.2 7.8L18.6 17.6C18.4 18.3 17.9 18.5 17.3 18.2L13.4 15.4L11.6 17.1C11.4 17.3 11.2 17.5 10.8 17.5L11.1 13.5L18.1 7.2C18.4 6.9 18 6.7 17.6 7L8.7 12.3L4.8 11.1C4.1 10.9 4.1 10.3 4.9 10L20.2 4.1C20.8 3.8 21.4 4.3 21.2 7.8Z"></path>
                    </svg>
                  </a>
                  <a 
                    href="https://github.com/peridotfinance" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-primary/10 hover:bg-primary/20 p-3 rounded-full transition-colors duration-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-primary">
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                    </svg>
                  </a>
                  <a 
                    href="https://medium.com/@peridot.finance" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="bg-primary/10 hover:bg-primary/20 p-3 rounded-full transition-colors duration-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-primary">
                      <path d="M2.846 6.887c.03-.295-.083-.586-.303-.784l-2.24-2.7v-.403h6.958l5.378 11.795 4.728-11.795h6.633v.403l-1.916 1.837c-.165.126-.247.333-.213.538v13.498c-.034.204.048.411.213.537l1.871 1.837v.403h-9.412v-.403l1.939-1.882c.19-.19.19-.246.19-.537v-10.91l-5.389 13.688h-.728l-6.275-13.688v9.174c-.052.385.076.774.347 1.052l2.521 3.058v.404h-7.148v-.404l2.521-3.058c.27-.279.39-.67.325-1.052v-10.608z"></path>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
} 