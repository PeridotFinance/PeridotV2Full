"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DeFiGuide } from "@/components/DeFiGuide"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  BookOpen, 
  Play, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Zap,
  ArrowRight,
  CheckCircle,
  Coins,
  Shield,
  DollarSign
} from "lucide-react"
import { cn } from "@/lib/utils"

interface GuideTabProps {
  onActivateMarkets: () => void
}

export function GuideTab({ onActivateMarkets }: GuideTabProps) {
  const [isGuideOpen, setIsGuideOpen] = useState(false)

  const quickStartSteps = [
    {
      icon: Wallet,
      title: "Connect Wallet",
      description: "Link your Web3 wallet to start earning",
      color: "from-blue-500 to-cyan-600"
    },
    {
      icon: TrendingUp,
      title: "Supply Assets",
      description: "Deposit crypto to earn interest",
      color: "from-green-500 to-emerald-600"
    },
    {
      icon: TrendingDown,
      title: "Borrow Funds",
      description: "Use collateral to borrow other assets",
      color: "from-orange-500 to-red-600"
    },
    {
      icon: Coins,
      title: "Earn Rewards",
      description: "Get points and APY on your positions",
      color: "from-purple-500 to-pink-600"
    }
  ]

  const features = [
    {
      icon: Zap,
      title: "Cross-Chain Lending",
      description: "Supply and borrow across multiple blockchains seamlessly",
      highlight: true
    },
    {
      icon: Shield,
      title: "Secure & Decentralized",
      description: "Your assets are protected by smart contracts",
      highlight: false
    },
    {
      icon: DollarSign,
      title: "Competitive APY",
      description: "Earn higher yields compared to traditional finance",
      highlight: false
    }
  ]

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <Card className="relative overflow-hidden border-0 shadow-2xl bg-gradient-to-br from-background via-background to-muted/20 rounded-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <CardContent className="relative p-8 text-center">
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
              <BookOpen className="w-10 h-10 text-white" />
      </div>

            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                DeFi Lending Guide
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                Learn how to earn yield and borrow against your crypto assets in just 4 simple steps
              </p>
              </div>
              
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                onClick={() => setIsGuideOpen(true)}
                size="lg"
                className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white shadow-lg"
              >
                <Play className="w-5 h-5 mr-2" />
                Start Interactive Guide
              </Button>
              <Button
                onClick={onActivateMarkets}
                variant="outline"
                size="lg"
                className="border-primary/20 hover:bg-primary/5"
              >
                Go to Markets
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Start Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {quickStartSteps.map((step, index) => (
          <Card key={step.title} className="relative overflow-hidden group hover:shadow-lg transition-all duration-300">
            <div className={cn(
              "absolute inset-0 bg-gradient-to-br opacity-5 group-hover:opacity-10 transition-opacity",
              step.color
            )} />
            <CardContent className="relative p-6 text-center space-y-4">
              <div className={cn(
                "w-16 h-16 mx-auto rounded-full bg-gradient-to-br flex items-center justify-center shadow-lg",
                step.color
              )}>
                <step.icon className="w-8 h-8 text-white" />
                  </div>
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    Step {index + 1}
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
                </div>

      {/* Features Section */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Why Choose Peridot?</h2>
          <p className="text-muted-foreground">Experience the future of decentralized finance</p>
                  </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature) => (
            <Card 
              key={feature.title} 
              className={cn(
                "relative overflow-hidden group hover:shadow-lg transition-all duration-300",
                feature.highlight && "ring-2 ring-primary/20"
              )}
            >
              {feature.highlight && (
                <div className="absolute top-4 right-4">
                  <Badge className="bg-primary text-primary-foreground">
                    Popular
                  </Badge>
                </div>
              )}
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <feature.icon className="w-6 h-6 text-primary" />
            </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
          </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Call to Action */}
      <Card className="bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 border-primary/20 rounded-xl">
        <CardContent className="p-8 text-center space-y-6">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Ready to Start Earning?</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Join thousands of users already earning yield on their crypto assets
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => setIsGuideOpen(true)}
              size="lg"
              className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white"
            >
              <Play className="w-5 h-5 mr-2" />
              Learn with Interactive Guide
            </Button>
            <Button
              onClick={onActivateMarkets}
              size="lg"
              variant="outline"
              className="border-primary/20 hover:bg-primary/5"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Start Trading Now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* DeFi Guide Modal */}
      <DeFiGuide 
        isOpen={isGuideOpen} 
        onClose={() => setIsGuideOpen(false)} 
      />
    </div>
  )
}