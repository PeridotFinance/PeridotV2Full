"use client"

import { useState, useEffect, useRef } from "react"
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  DollarSign, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle, 
  Coins,
  Shield,
  Zap,
  X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface DeFiGuideProps {
  isOpen: boolean
  onClose: () => void
  onComplete?: () => void
}

const slides = [
  {
    id: 1,
    title: "What is DeFi Lending?",
    subtitle: "Earn interest on your crypto",
    icon: TrendingUp,
    color: "from-green-500 to-emerald-600",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
    content: (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <TrendingUp className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 drop-shadow-lg">Supply Assets</h3>
          <p className="text-slate-700 dark:text-white/80 text-sm leading-relaxed">
            Deposit your crypto assets into our lending pools and earn interest automatically
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-green-500/10 via-green-400/5 to-emerald-500/10 backdrop-blur-sm border border-green-500/20 shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500/30 to-emerald-500/20 flex items-center justify-center backdrop-blur-sm border border-green-400/30 shadow-lg">
              <Wallet className="w-6 h-6 text-green-100 drop-shadow-lg" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-base text-slate-900 dark:text-white">Deposit USDC</div>
              <div className="text-sm text-slate-700 dark:text-white/80">Earn up to 5.2% APY</div>
              <div className="text-sm text-green-600 dark:text-green-300 font-bold mt-1 drop-shadow-sm">
                $10,000 → $520/year
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-cyan-400/5 to-sky-500/10 backdrop-blur-sm border border-blue-500/20 shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/30 to-cyan-500/20 flex items-center justify-center backdrop-blur-sm border border-blue-400/30 shadow-lg">
              <Coins className="w-6 h-6 text-blue-100 drop-shadow-lg" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-base text-slate-900 dark:text-white">Earn Interest</div>
              <div className="text-sm text-slate-700 dark:text-white/80">Compounds automatically</div>
              <div className="text-sm text-blue-600 dark:text-blue-300 font-bold mt-1 drop-shadow-sm">
                Daily compounding
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 2,
    title: "What is DeFi Borrowing?",
    subtitle: "Borrow against your collateral",
    icon: TrendingDown,
    color: "from-orange-500 to-red-600",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
    content: (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <TrendingDown className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 drop-shadow-lg">Borrow Assets</h3>
          <p className="text-slate-700 dark:text-white/80 text-sm leading-relaxed">
            Use your supplied assets as collateral to borrow other cryptocurrencies
          </p>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-400/5 to-yellow-500/10 backdrop-blur-sm border border-orange-500/20 shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500/30 to-amber-500/20 flex items-center justify-center backdrop-blur-sm border border-orange-400/30 shadow-lg">
              <Shield className="w-6 h-6 text-orange-100 drop-shadow-lg" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-base text-slate-900 dark:text-white">Use as Collateral</div>
              <div className="text-sm text-slate-700 dark:text-white/80">Your USDC secures the loan</div>
              <div className="text-sm text-orange-600 dark:text-orange-300 font-bold mt-1 drop-shadow-sm">
                $10,000 USDC → Borrow up to $8,000
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 via-violet-400/5 to-indigo-500/10 backdrop-blur-sm border border-purple-500/20 shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/30 to-violet-500/20 flex items-center justify-center backdrop-blur-sm border border-purple-400/30 shadow-lg">
              <DollarSign className="w-6 h-6 text-purple-100 drop-shadow-lg" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-base text-slate-900 dark:text-white">Borrow ETH</div>
              <div className="text-sm text-slate-700 dark:text-white/80">Pay 3.8% interest</div>
              <div className="text-sm text-purple-600 dark:text-purple-300 font-bold mt-1 drop-shadow-sm">
                $8,000 loan → $304/year interest
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 3,
    title: "How Supply Works",
    subtitle: "Earn yield on your deposits",
    icon: Wallet,
    color: "from-blue-500 to-cyan-600",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    content: (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
            <Wallet className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 drop-shadow-lg">Supply Process</h3>
          <p className="text-slate-700 dark:text-white/80 text-sm leading-relaxed">
            Simple steps to start earning on your crypto assets
          </p>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-blue-500/10 via-cyan-400/5 to-sky-500/10 backdrop-blur-sm border border-blue-500/20">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              1
            </div>
            <div>
              <div className="font-medium text-sm text-slate-900 dark:text-white">Connect Wallet</div>
              <div className="text-xs text-slate-600 dark:text-white/70">Link your crypto wallet to the platform</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-blue-500/10 via-cyan-400/5 to-sky-500/10 backdrop-blur-sm border border-blue-500/20">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              2
            </div>
            <div>
              <div className="font-medium text-sm text-slate-900 dark:text-white">Choose Asset</div>
              <div className="text-xs text-slate-600 dark:text-white/70">Select which crypto you want to supply</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-blue-500/10 via-cyan-400/5 to-sky-500/10 backdrop-blur-sm border border-blue-500/20">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              3
            </div>
            <div>
              <div className="font-medium text-sm text-slate-900 dark:text-white">Deposit & Earn</div>
              <div className="text-xs text-slate-600 dark:text-white/70">Start earning interest immediately</div>
            </div>
          </div>
        </div>
        
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-500/15 via-cyan-400/10 to-sky-500/15 backdrop-blur-sm border border-blue-500/30 shadow-xl">
          <div className="text-center">
            <div className="text-2xl text-slate-900 dark:text-white mb-1 drop-shadow-lg">5.2% APY</div>
            <div className="text-sm text-slate-700 dark:text-white/80 mb-2 font-medium">Current USDC supply rate</div>
            <div className="text-sm text-blue-600 dark:text-blue-200 drop-shadow-sm">
              $10,000 investment = $520/year earnings
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 4,
    title: "How Borrowing Works",
    subtitle: "Borrow against your collateral",
    icon: Zap,
    color: "from-purple-500 to-pink-600",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    content: (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 drop-shadow-lg">Borrow Process</h3>
          <p className="text-slate-700 dark:text-white/80 text-sm leading-relaxed">
            Access liquidity without selling your crypto assets
          </p>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-orange-500/10 via-amber-400/5 to-yellow-500/10 backdrop-blur-sm border border-orange-500/20">
            <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              1
            </div>
            <div>
              <div className="font-medium text-sm text-slate-900 dark:text-white">Supply Collateral</div>
              <div className="text-xs text-slate-600 dark:text-white/70">Deposit assets to secure your loan</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-orange-500/10 via-amber-400/5 to-yellow-500/10 backdrop-blur-sm border border-orange-500/20">
            <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              2
            </div>
            <div>
              <div className="font-medium text-sm text-slate-900 dark:text-white">Choose Borrow Amount</div>
              <div className="text-xs text-slate-600 dark:text-white/70">Borrow up to 80% of collateral value</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-orange-500/10 via-amber-400/5 to-yellow-500/10 backdrop-blur-sm border border-orange-500/20">
            <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
              3
            </div>
            <div>
              <div className="font-medium text-sm text-slate-900 dark:text-white">Repay Anytime</div>
              <div className="text-xs text-slate-600 dark:text-white/70">No fixed terms, repay when convenient</div>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-green-500/15 via-emerald-400/10 to-teal-500/15 backdrop-blur-sm border border-green-500/30 text-center shadow-xl">
            <div className="text-2xl font-bold text-slate-900 dark:text-white mb-2 drop-shadow-lg">80%</div>
            <div className="text-sm text-slate-700 dark:text-white/80 mb-2 font-medium">Max LTV</div>
            <div className="text-sm text-green-600 dark:text-green-300 font-medium drop-shadow-sm">
              $10K → $8K max
            </div>
          </div>
          <div className="p-5 rounded-2xl bg-gradient-to-br from-orange-500/15 via-amber-400/10 to-yellow-500/15 backdrop-blur-sm border border-orange-500/30 text-center shadow-xl">
            <div className="text-2xl font-bold text-slate-900 dark:text-white mb-2 drop-shadow-lg">3.8%</div>
            <div className="text-sm text-slate-700 dark:text-white/80 mb-2 font-medium">Borrow Rate</div>
            <div className="text-sm text-orange-600 dark:text-orange-300 font-medium drop-shadow-sm">
              $8K loan → $304/year
            </div>
          </div>
        </div>
      </div>
    )
  }
]

export const DeFiGuide = ({ isOpen, onClose, onComplete }: DeFiGuideProps) => {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  const nextSlide = () => {
    if (currentSlide < slides.length - 1 && !isAnimating) {
      setIsAnimating(true)
      setCurrentSlide(prev => prev + 1)
      setTimeout(() => setIsAnimating(false), 300)
    }
  }

  const prevSlide = () => {
    if (currentSlide > 0 && !isAnimating) {
      setIsAnimating(true)
      setCurrentSlide(prev => prev - 1)
      setTimeout(() => setIsAnimating(false), 300)
    }
  }

  const goToSlide = (index: number) => {
    if (index !== currentSlide && !isAnimating) {
      setIsAnimating(true)
      setCurrentSlide(index)
      setTimeout(() => setIsAnimating(false), 300)
    }
  }

  const progress = ((currentSlide + 1) / slides.length) * 100

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const currentSlideData = slides[currentSlide]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-4 sm:pt-20 bg-black/60 backdrop-blur-md animate-in fade-in-0 duration-300">
      <div
        ref={dialogRef}
        className="w-full max-w-sm md:max-w-md mx-auto animate-in zoom-in-95 duration-300 h-[85dvh] sm:h-[80vh] max-h-[600px] min-h-[400px] flex flex-col"
      >
        <Card className="relative overflow-hidden border-0 shadow-2xl rounded-2xl bg-white dark:bg-slate-900/90 dark:backdrop-blur-xl border border-slate-200 dark:border-white/20 h-full flex flex-col">
          {/* Dark mode glass overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-white/10 to-transparent hidden dark:block pointer-events-none rounded-2xl" />
          
          {/* Header */}
          <CardHeader className="relative pb-2 sm:pb-6 px-4 sm:px-8 flex-shrink-0">
            {/* Liquid Glass Header Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10 dark:from-primary/20 dark:via-accent/10 dark:to-primary/20 rounded-t-2xl" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent dark:from-white/5 dark:to-transparent rounded-t-2xl" />
            
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-2xl backdrop-blur-sm border border-white/20",
                  `bg-gradient-to-br ${currentSlideData.color}`,
                  "dark:bg-gradient-to-br dark:from-white/20 dark:to-white/10"
                )}>
                  <currentSlideData.icon className="w-5 h-5 sm:w-7 sm:h-7 text-slate-900 dark:text-white drop-shadow-lg" />
                </div>
                <div>
                  <CardTitle className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white drop-shadow-lg">
                    {currentSlideData.title}
                  </CardTitle>
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-white/80 font-medium">
                    {currentSlideData.subtitle}
                  </p>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-slate-600 dark:text-white/80 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/20 rounded-xl p-2 sm:p-3 backdrop-blur-sm border border-slate-200 dark:border-white/10 transition-all duration-200"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </div>
            
            {/* Enhanced Progress Bar */}
            <div className="mt-4 sm:mt-6">
              <div className="flex items-center justify-between text-xs sm:text-sm text-slate-800 dark:text-white/90 mb-2 sm:mb-3 font-medium">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="relative h-2 sm:h-3 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm border border-white/20">
                <div 
                  className="h-full bg-gradient-to-r from-primary via-accent to-primary rounded-full transition-all duration-500 ease-out shadow-lg"
                  style={{ width: `${progress}%` }}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full" />
              </div>
            </div>
          </CardHeader>

          {/* Content */}
          <CardContent className="px-4 sm:px-8 pb-4 sm:pb-8 flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto -mr-2 pr-2 custom-scrollbar">
               <div className="space-y-6 pb-4">
                {currentSlideData.content}
               </div>
            </div>

            {/* Navigation */}
            <div className="flex-shrink-0 flex items-center justify-between pt-4 sm:pt-6 border-t border-slate-100 dark:border-white/5 mt-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={prevSlide}
                disabled={currentSlide === 0 || isAnimating}
                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-xl backdrop-blur-sm border border-slate-200 dark:border-white/20 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white hover:text-slate-900 dark:hover:text-white transition-all duration-200 shadow-lg text-xs sm:text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>

              {/* Slide Indicators */}
              <div className="flex gap-3">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToSlide(index)}
                    className={cn(
                      "w-3 h-3 sm:w-4 sm:h-4 rounded-full transition-all duration-300 backdrop-blur-sm border border-white/20 shadow-lg",
                      index === currentSlide
                        ? "bg-gradient-to-r from-primary to-accent scale-125 shadow-primary/50 w-6 sm:w-8"
                        : "bg-white/20 hover:bg-white/30"
                    )}
                  />
                ))}
              </div>

              {currentSlide === slides.length - 1 ? (
                <Button
                  onClick={onComplete || onClose}
                  className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-xl bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white shadow-2xl shadow-primary/25 transition-all duration-200 text-xs sm:text-sm"
                >
                  <CheckCircle className="h-4 w-4" />
                  Start
                </Button>
              ) : (
                <Button
                  onClick={nextSlide}
                  disabled={isAnimating}
                  className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-xl backdrop-blur-sm border border-slate-200 dark:border-white/20 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white hover:text-slate-900 dark:hover:text-white transition-all duration-200 shadow-lg text-xs sm:text-sm"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>

          {/* Background Gradient */}
          <div className={cn(
            "absolute inset-0 -z-10 opacity-5",
            `bg-gradient-to-br ${currentSlideData.color}`
          )} />
        </Card>
      </div>
    </div>
  )
}
