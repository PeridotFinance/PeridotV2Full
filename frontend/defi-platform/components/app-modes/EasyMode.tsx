"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { 
  ArrowRight, ArrowLeft, Sparkles, TrendingUp, Plus, Info, WalletIcon, 
  BarChart3, RefreshCw, Globe, Smartphone, CreditCard, Building, 
  ArrowUpRight, HelpCircle, Zap, Check, User, BarChart4, History, 
  PiggyBank, X, LineChart
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "next-themes"
import { useMobile } from "@/hooks/use-mobile"
import dynamic from "next/dynamic"

// Dynamically import the loading component
const EasyModeLoading = dynamic(() => import("./EasyModeLoading"), {
  ssr: false,
  loading: () => <div className="flex justify-center items-center p-8">Loading Easy Mode...</div>
})

// Define the Step Types
export type OnboardingStep = "welcome" | "profile" | "funding" | "invest" | "complete"
export type PaymentMethod = "bank" | "card" | "paypal"
export type EasyModeAction = "deposit" | "withdraw" | "earn" | "borrow"
export type EasyModeTransaction = {
  id: string
  type: "deposit" | "withdrawal" | "interest" | "borrow" | "repayment"
  asset: string
  amount: number
  date: string
  status: "completed" | "pending" | "failed"
}

interface EasyModeProps {
  onExitEasyMode: () => void
}

export const EasyMode = ({ onExitEasyMode }: EasyModeProps) => {
  const isMobile = useMobile()
  const [activeTab, setActiveTab] = useState<"dashboard" | "history" | "wallet">("dashboard")
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("welcome")
  const [onboardingComplete, setOnboardingComplete] = useState<boolean>(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("bank")
  const [paymentAmount, setPaymentAmount] = useState<string>("1000")
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [selectedInvestStrategy, setSelectedInvestStrategy] = useState<string>("balanced")
  const [isLoading, setIsLoading] = useState(true)
  const { theme } = useTheme()
  const isDarkMode = theme === "dark"
  
  // Refs for accessibility focus management
  const exitButtonRef = useRef<HTMLButtonElement>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const mainHeadingRef = useRef<HTMLHeadingElement>(null)

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
      // Focus on main heading when loaded for accessibility
      mainHeadingRef.current?.focus()
    }, 800)
    return () => clearTimeout(timer)
  }, [])

  // Handle keyboard escape to exit easy mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onExitEasyMode()
      }
    }
    
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onExitEasyMode])

  // Demo data for the dashboard
  const demoBalances = {
    total: "$15,423.82",
    supplied: "$12,450.00",
    borrowed: "$4,971.50",
    available: "$8,502.32"
  }
  
  // Sample transaction history
  const transactions: EasyModeTransaction[] = [
    {
      id: "tx1",
      type: "deposit",
      asset: "USDC",
      amount: 5000,
      date: "2023-11-18",
      status: "completed"
    },
    {
      id: "tx2",
      type: "interest",
      asset: "USDC",
      amount: 12.50,
      date: "2023-11-15",
      status: "completed"
    },
    {
      id: "tx3",
      type: "withdrawal",
      asset: "ETH",
      amount: 0.5,
      date: "2023-11-12",
      status: "completed"
    },
    {
      id: "tx4",
      type: "borrow",
      asset: "DAI",
      amount: 1000,
      date: "2023-11-10",
      status: "pending"
    }
  ]

  const handleNextStep = () => {
    // Logic to navigate to the next onboarding step
    if (onboardingStep === "welcome") {
      setOnboardingStep("profile")
    } else if (onboardingStep === "profile") {
      setOnboardingStep("funding")
    } else if (onboardingStep === "funding") {
      setOnboardingStep("invest")
    } else if (onboardingStep === "invest") {
      setOnboardingStep("complete")
      // Simulate completion after 2 seconds
      setTimeout(() => {
        setOnboardingComplete(true)
        setActiveTab("dashboard")
        // Focus on appropriate element after completion
        setTimeout(() => mainHeadingRef.current?.focus(), 100)
      }, 2000)
    }
    
    // Focus management for next steps
    setTimeout(() => nextButtonRef.current?.focus(), 100)
  }

  const handleProcessPayment = () => {
    // Simulate payment processing
    setIsProcessing(true)
    setTimeout(() => {
      setIsProcessing(false)
      handleNextStep()
    }, 2000)
  }

  const handleStartOnboarding = () => {
    // Reset onboarding state
    setOnboardingComplete(false)
    setOnboardingStep("welcome")
    // Focus management
    setTimeout(() => nextButtonRef.current?.focus(), 100)
  }

  // Display loading state
  if (isLoading) {
    return <EasyModeLoading />
  }

  // Display easy mode exit button
  const ExitEasyModeButton = () => (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={onExitEasyMode}
      ref={exitButtonRef}
      className="absolute top-4 right-4 flex items-center gap-1"
      aria-label="Exit Easy Mode"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span>Exit Easy Mode</span>
    </Button>
  )

  // Render onboarding experience if not completed
  if (!onboardingComplete) {
    return (
      <div 
        className="container mx-auto px-4 py-8 max-w-3xl relative"
        role="region"
        aria-label={`Easy Mode Setup - Step ${
          onboardingStep === "welcome" ? "1: Welcome" : 
          onboardingStep === "profile" ? "2: Profile" :
          onboardingStep === "funding" ? "3: Funding" :
          onboardingStep === "invest" ? "4: Investment Strategy" :
          "5: Completion"
        }`}
      >
        <ExitEasyModeButton />
        
        {/* Progress indicator */}
        <div className="mb-6 mt-6">
          <div className="flex justify-between mb-2">
            {["welcome", "profile", "funding", "invest", "complete"].map((step, index) => (
              <div 
                key={step}
                className="flex flex-col items-center"
                aria-current={onboardingStep === step ? "step" : undefined}
              >
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center mb-1
                    ${onboardingStep === step 
                      ? "bg-primary text-primary-foreground" 
                      : index < ["welcome", "profile", "funding", "invest", "complete"].indexOf(onboardingStep)
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                >
                  {index + 1}
                </div>
                <span className="text-xs hidden md:block">
                  {step.charAt(0).toUpperCase() + step.slice(1)}
                </span>
              </div>
            ))}
          </div>
          <Progress 
            value={(["welcome", "profile", "funding", "invest", "complete"].indexOf(onboardingStep) + 1) * 20} 
            className="h-1" 
            aria-hidden="true"
          />
        </div>
        
        {/* Onboarding steps */}
        <Card className="mt-8">
          <CardHeader className="text-center">
            <CardTitle 
              className="text-2xl"
              ref={mainHeadingRef}
              tabIndex={-1}
            >
              {onboardingStep === "welcome" && "Welcome to Easy Mode"}
              {onboardingStep === "profile" && "Set Up Your Profile"}
              {onboardingStep === "funding" && "Add Funds"}
              {onboardingStep === "invest" && "Investment Strategy"}
              {onboardingStep === "complete" && "All Set!"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-6">
            {onboardingStep === "welcome" && (
              <div className="text-center space-y-6">
                <div className="w-20 h-20 mx-auto bg-primary/20 rounded-full flex items-center justify-center">
                  <Sparkles className="h-10 w-10 text-primary" />
                </div>
                <p className="text-muted-foreground">
                  Easy Mode simplifies DeFi investing with guided steps and simplified options. 
                  Perfect for beginners or anyone who wants a streamlined experience.
                </p>
                <Button 
                  onClick={handleNextStep} 
                  className="w-full md:w-auto"
                  ref={nextButtonRef}
                >
                  Start Easy Setup <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Profile setup step */}
            {onboardingStep === "profile" && (
              <div className="space-y-6">
                <div className="w-20 h-20 mx-auto bg-blue-500/20 rounded-full flex items-center justify-center">
                  <User className="h-10 w-10 text-blue-500" />
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="risk-tolerance">Risk Tolerance</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {["Conservative", "Balanced", "Aggressive"].map((option) => (
                        <Button 
                          key={option} 
                          variant={option === "Balanced" ? "default" : "outline"} 
                          className="w-full"
                          onClick={() => {}}
                          aria-pressed={option === "Balanced"}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      This helps us recommend the right investment strategy for you
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="investment-duration">Investment Duration</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {["Short-term", "Medium", "Long-term"].map((option) => (
                        <Button 
                          key={option} 
                          variant={option === "Medium" ? "default" : "outline"} 
                          className="w-full"
                          onClick={() => {}}
                          aria-pressed={option === "Medium"}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      How long you plan to keep your assets invested
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="enable-notifications">Enable Notifications</Label>
                      <Switch id="enable-notifications" defaultChecked />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Receive updates about your portfolio and market changes
                    </p>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setOnboardingStep("welcome")}
                  >
                    Back
                  </Button>
                  <Button 
                    onClick={handleNextStep}
                    ref={nextButtonRef}
                  >
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Funding step */}
            {onboardingStep === "funding" && (
              <div className="space-y-6">
                <div className="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
                  <PiggyBank className="h-10 w-10 text-green-500" />
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="payment-amount">Initial Investment Amount</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <input
                        type="text"
                        id="payment-amount"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        className="w-full px-8 py-2 border rounded-md"
                        placeholder="1000"
                      />
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-2 text-xs"
                        onClick={() => setPaymentAmount("5000")}
                      >
                        MAX
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Recommended minimum: $100
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant={selectedPaymentMethod === "bank" ? "default" : "outline"}
                        className="w-full flex-col py-4 h-auto"
                        onClick={() => setSelectedPaymentMethod("bank")}
                        aria-pressed={selectedPaymentMethod === "bank"}
                      >
                        <Building className="h-5 w-5 mb-1" />
                        <span className="text-xs">Bank</span>
                      </Button>
                      <Button
                        variant={selectedPaymentMethod === "card" ? "default" : "outline"}
                        className="w-full flex-col py-4 h-auto"
                        onClick={() => setSelectedPaymentMethod("card")}
                        aria-pressed={selectedPaymentMethod === "card"}
                      >
                        <CreditCard className="h-5 w-5 mb-1" />
                        <span className="text-xs">Card</span>
                      </Button>
                      <Button
                        variant={selectedPaymentMethod === "paypal" ? "default" : "outline"}
                        className="w-full flex-col py-4 h-auto"
                        onClick={() => setSelectedPaymentMethod("paypal")}
                        aria-pressed={selectedPaymentMethod === "paypal"}
                      >
                        <Globe className="h-5 w-5 mb-1" />
                        <span className="text-xs">PayPal</span>
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setOnboardingStep("profile")}
                  >
                    Back
                  </Button>
                  <Button 
                    onClick={handleProcessPayment}
                    disabled={isProcessing}
                    ref={nextButtonRef}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Processing
                      </>
                    ) : (
                      <>
                        Continue <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Investment strategy step */}
            {onboardingStep === "invest" && (
              <div className="space-y-6">
                <div className="w-20 h-20 mx-auto bg-primary/20 rounded-full flex items-center justify-center">
                  <TrendingUp className="h-10 w-10 text-primary" />
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select Investment Strategy</Label>
                    <div className="grid grid-cols-1 gap-3">
                      <Button
                        variant={selectedInvestStrategy === "conservative" ? "default" : "outline"}
                        className="w-full justify-between px-4 py-3 h-auto"
                        onClick={() => setSelectedInvestStrategy("conservative")}
                        aria-pressed={selectedInvestStrategy === "conservative"}
                      >
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center mr-3">
                            <Zap className="h-4 w-4 text-blue-500" />
                          </div>
                          <div className="text-left">
                            <div className="font-medium">Conservative</div>
                            <div className="text-xs text-muted-foreground">Low risk, stable returns (2-4% APY)</div>
                          </div>
                        </div>
                        {selectedInvestStrategy === "conservative" && <Check className="h-5 w-5" />}
                      </Button>
                      
                      <Button
                        variant={selectedInvestStrategy === "balanced" ? "default" : "outline"}
                        className="w-full justify-between px-4 py-3 h-auto"
                        onClick={() => setSelectedInvestStrategy("balanced")}
                        aria-pressed={selectedInvestStrategy === "balanced"}
                      >
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center mr-3">
                            <BarChart3 className="h-4 w-4 text-green-500" />
                          </div>
                          <div className="text-left">
                            <div className="font-medium">Balanced</div>
                            <div className="text-xs text-muted-foreground">Moderate risk, medium returns (4-8% APY)</div>
                          </div>
                        </div>
                        {selectedInvestStrategy === "balanced" && <Check className="h-5 w-5" />}
                      </Button>
                      
                      <Button
                        variant={selectedInvestStrategy === "aggressive" ? "default" : "outline"}
                        className="w-full justify-between px-4 py-3 h-auto"
                        onClick={() => setSelectedInvestStrategy("aggressive")}
                        aria-pressed={selectedInvestStrategy === "aggressive"}
                      >
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center mr-3">
                            <LineChart className="h-4 w-4 text-orange-500" />
                          </div>
                          <div className="text-left">
                            <div className="font-medium">Aggressive</div>
                            <div className="text-xs text-muted-foreground">Higher risk, potential for higher returns (8-12%+ APY)</div>
                          </div>
                        </div>
                        {selectedInvestStrategy === "aggressive" && <Check className="h-5 w-5" />}
                      </Button>
                    </div>
                  </div>

                  <div className="p-4 bg-secondary/20 rounded-lg">
                    <h4 className="text-sm font-medium mb-2">Strategy Details</h4>
                    {selectedInvestStrategy === "conservative" && (
                      <p className="text-sm text-muted-foreground">
                        Focuses on stable assets like stablecoins with low volatility. Minimizes risk with safer lending protocols.
                      </p>
                    )}
                    {selectedInvestStrategy === "balanced" && (
                      <p className="text-sm text-muted-foreground">
                        A mix of stablecoins and established cryptocurrencies. Balances between safer interest and higher yield potential.
                      </p>
                    )}
                    {selectedInvestStrategy === "aggressive" && (
                      <p className="text-sm text-muted-foreground">
                        Includes more volatile assets and leveraged positions for maximum returns. Higher risk but potential for greater rewards.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setOnboardingStep("funding")}
                  >
                    Back
                  </Button>
                  <Button 
                    onClick={handleNextStep}
                    ref={nextButtonRef}
                  >
                    Finish Setup <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            
            {onboardingStep === "complete" && (
              <div className="text-center space-y-6">
                <div className="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
                  <Check className="h-10 w-10 text-green-500" />
                </div>
                <p className="text-muted-foreground">
                  Your account is set up and your funds are being processed. You'll be redirected to your dashboard in a moment.
                </p>
                <div className="w-full" aria-label="Loading dashboard" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={100}>
                  <Progress value={100} className="h-2" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Render dashboard if onboarding is complete
  return (
    <div 
      className="container mx-auto px-4 py-8 relative"
      role="region"
      aria-label="Easy Mode Dashboard"
    >
      <ExitEasyModeButton />
      
      <h1 
        className="text-3xl font-bold mb-6"
        ref={mainHeadingRef}
        tabIndex={-1}
      >
        My Dashboard
      </h1>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm text-gray-500">Total Balance</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-2xl font-bold">{demoBalances.total}</p>
            <div className="flex items-center text-xs text-green-500 mt-1">
              <TrendingUp className="h-3 w-3 mr-1" />
              <span>+2.14%</span>
            </div>
          </CardContent>
        </Card>
        
        {/* More cards can go here */}
      </div>
      
      <Tabs 
        value={activeTab} 
        onValueChange={(value) => setActiveTab(value as any)} 
        className="mb-6"
      >
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="dashboard">
            <BarChart4 className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="wallet">
            <WalletIcon className="h-4 w-4 mr-2" />
            Wallet
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard">
          <h2 className="text-xl font-medium mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {/* Action cards go here */}
            <Card 
              className="hover:border-primary/50 cursor-pointer transition-colors"
              tabIndex={0}
              role="button"
              aria-label="Deposit funds"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  // Handle deposit action here
                  e.preventDefault()
                }
              }}
            >
              <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center mb-2">
                  <ArrowUpRight className="h-5 w-5 text-blue-500" />
                </div>
                <h3 className="font-medium">Deposit</h3>
                <p className="text-xs text-muted-foreground">Add funds</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="history">
          <h2 className="text-xl font-medium mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {transactions.map(tx => (
              <Card key={tx.id} className="overflow-hidden">
                <CardContent className="p-4 grid grid-cols-3">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center mr-3">
                      {tx.type === "deposit" && <ArrowUpRight className="h-4 w-4 text-primary" />}
                      {tx.type === "withdrawal" && <ArrowRight className="h-4 w-4 text-orange-500" />}
                      {tx.type === "interest" && <Sparkles className="h-4 w-4 text-green-500" />}
                      {tx.type === "borrow" && <WalletIcon className="h-4 w-4 text-blue-500" />}
                    </div>
                    <div>
                      <div className="font-medium">{tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}</div>
                      <div className="text-xs text-muted-foreground">{new Date(tx.date).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="font-medium">{tx.asset}</div>
                  </div>
                  <div className="flex items-center justify-end">
                    <div className="font-medium">{tx.amount.toLocaleString()}</div>
                    <Badge variant="outline" className="ml-2" 
                      style={{
                        color: tx.status === 'completed' ? 'green' : tx.status === 'pending' ? 'orange' : 'red',
                        borderColor: tx.status === 'completed' ? 'green' : tx.status === 'pending' ? 'orange' : 'red',
                      }}
                    >
                      {tx.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        
        <TabsContent value="wallet">
          <h2 className="text-xl font-medium mb-4">Connected Wallet</h2>
          <Card>
            <CardContent className="p-4">
              <p>Your wallet integration will appear here</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* "Back to Advanced Mode" button for better discoverability */}
      <div className="mt-12 text-center">
        <p className="text-muted-foreground mb-2">Want more control over your investments?</p>
        <Button 
          variant="outline" 
          onClick={onExitEasyMode}
          className="mx-auto"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Switch to Advanced Mode
        </Button>
      </div>
    </div>
  )
}

export default EasyMode 