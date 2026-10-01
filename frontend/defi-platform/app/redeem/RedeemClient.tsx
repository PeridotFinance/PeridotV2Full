'use client'

import React, { useState, useEffect } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useLogin, usePrivy } from '@privy-io/react-auth'
import { ConnectWalletButton } from '@/components/wallet/connect-wallet-button'
import { ethers } from 'ethers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Sparkles, CheckCircle2, LockKeyhole, Gift, ShieldCheck, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { FEATURE_FLAGS } from '@/config/featureFlags'

export default function RedeemClient() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { login } = useLogin()
  const { ready: privyReady, authenticated } = usePrivy()
  
  const [code, setCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<{ points: number, code: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)

  // Helper to open connection modal programmatically
  const openConnectModal = () => {
    if (FEATURE_FLAGS.WALLET_PRIVY_EXPERIMENT) {
      if (privyReady && !authenticated) {
        login()
      }
    } else {
      // For AppKit/Reown, we can try to click the appkit-button programmatically 
      // or rely on the user clicking the Connect Wallet button we render
      const appkitBtn = document.querySelector('appkit-button') as HTMLElement
      if (appkitBtn) {
        appkitBtn.click()
      } else {
        // Fallback: just scroll to top or show toast
         toast.info("Please connect your wallet using the button above.")
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    
    setError(null)
    setIsSubmitting(true)

    try {
      if (!isConnected || !address) {
        openConnectModal()
        setIsSubmitting(false)
        return
      }

      const timestamp = Date.now()
      const upperCode = code.trim().toUpperCase()
      const message = `I am redeeming code "${upperCode}" for wallet ${address.toLowerCase()} at timestamp ${timestamp}`
      
      // 1. User signs the message
      const signature = await signMessageAsync({ message })

      // 2. Send to API
      const res = await fetch('/api/user/redeem-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          signature,
          timestamp,
          code: upperCode
        })
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to redeem code')
      }

      // Success!
      setResult({ points: data.data.pointsAwarded, code: data.data.code })
      setShowConfetti(true)
      toast.success(`Successfully redeemed ${data.data.pointsAwarded} points!`)
      setCode('')
      
    } catch (err: any) {
      console.error(err)
      const errMsg = err.message || 'Something went wrong'
      setError(errMsg)
      toast.error(errMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-background selection:bg-primary/20">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] animate-float-slow"></div>
        <div className="absolute bottom-[-10%] right-[-20%] w-[700px] h-[700px] rounded-full bg-accent/5 blur-[140px] animate-float-delayed"></div>
        <div className="absolute top-[40%] left-[20%] w-[300px] h-[300px] rounded-full bg-secondary/5 blur-[90px] animate-pulse-slow"></div>
      </div>

      {/* CSS Confetti Container */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-5%`,
                backgroundColor: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'][Math.floor(Math.random() * 5)],
                animationDelay: `${Math.random() * 3}s`,
                transform: `rotate(${Math.random() * 360}deg)`
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 container max-w-4xl mx-auto px-4 py-20 lg:py-32 min-h-screen flex flex-col justify-center items-center">
        
        {/* Header Section */}
        <div className="text-center mb-12 animate-fade-in-up">
          <div className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 animate-float">
            <LockKeyhole className="w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-accent to-primary bg-[200%_auto] animate-gradient-x">
              Secret Vault
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Enter your secret code to unlock exclusive rewards and boost your platform standing.
          </p>
        </div>

        {/* Main Card */}
        <div className="w-full max-w-md animate-fade-in-up delay-100">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-accent rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl ring-1 ring-white/10">
              
              {!result ? (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label htmlFor="code" className="text-sm font-medium ml-1 flex items-center gap-2">
                      <Gift className="w-4 h-4 text-primary" /> Secret Code
                    </label>
                    <div className="relative group/input">
                      <Input
                        id="code"
                        type="text"
                        placeholder="ENTER-CODE-HERE"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="h-14 px-5 text-lg bg-background/50 border-2 border-border/50 focus:border-primary/50 transition-all uppercase tracking-wider font-mono shadow-inner"
                        disabled={isSubmitting}
                      />
                      <div className="absolute inset-0 rounded-md ring-2 ring-primary/20 opacity-0 group-focus-within/input:opacity-100 pointer-events-none transition-opacity duration-300" />
                    </div>
                  </div>

                  {error && (
                    <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3 animate-shake">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <p>{error}</p>
                    </div>
                  )}

                  {isConnected ? (
                     <Button 
                     type="submit" 
                     size="lg" 
                     className="w-full h-14 text-lg font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden"
                     disabled={isSubmitting || !code}
                   >
                     <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] animate-shimmer" />
                     {isSubmitting ? (
                       <>
                         <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                         Verifying...
                       </>
                     ) : (
                       <>
                         Unlock Rewards
                         <Sparkles className="w-5 h-5 ml-2" />
                       </>
                     )}
                   </Button>
                  ) : (
                    <div className="w-full h-14 relative overflow-hidden rounded-md">
                       <ConnectWalletButton className="w-full h-full [&>button]:w-full [&>button]:h-full [&>button]:text-lg [&>button]:font-semibold" />
                    </div>
                  )}
                  
                  <p className="text-xs text-center text-muted-foreground/70">
                    <ShieldCheck className="w-3 h-3 inline mr-1 -mt-0.5" />
                    Secure redemption verification via wallet signature
                  </p>
                </form>
              ) : (
                <div className="text-center py-8 space-y-6 animate-scale-in">
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full animate-pulse-slow" />
                    <CheckCircle2 className="w-20 h-20 text-green-500 relative z-10 mx-auto" />
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-foreground">Access Granted!</h3>
                    <p className="text-muted-foreground">You have successfully claimed your reward.</p>
                  </div>

                  <div className="py-6 px-8 bg-gradient-to-br from-primary/10 to-transparent rounded-xl border border-primary/10 mx-4">
                    <p className="text-sm text-muted-foreground mb-1">Reward Unlocked</p>
                    <div className="text-5xl font-bold text-primary flex items-center justify-center gap-2">
                      <span className="tabular-nums tracking-tighter">+{result.points}</span>
                      <span className="text-xl font-medium text-primary/70">XP</span>
                    </div>
                  </div>

                  <Button 
                    onClick={() => { setResult(null); setCode(''); setShowConfetti(false); }}
                    variant="outline"
                    className="mt-4"
                  >
                    Redeem Another Code
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Interactive Decorations */}
        <div className="absolute top-1/4 left-10 md:left-20 opacity-20 animate-float-4s hidden lg:block">
          <div className="w-16 h-16 border-4 border-primary rounded-xl rotate-12"></div>
        </div>
        <div className="absolute bottom-1/4 right-10 md:right-20 opacity-20 animate-float-6s hidden lg:block">
          <div className="w-20 h-20 border-4 border-accent rounded-full"></div>
        </div>

      </div>

      <style jsx global>{`
        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20px, 40px); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-30px, 20px); }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
        @keyframes gradient-x {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes shimmer {
          100% { transform: translateX(200%); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }

        .animate-float-slow { animation: float-slow 20s ease-in-out infinite; }
        .animate-float-delayed { animation: float-delayed 25s ease-in-out infinite; }
        .animate-pulse-slow { animation: pulse-slow 8s ease-in-out infinite; }
        .animate-gradient-x { animation: gradient-x 3s ease infinite; }
        .animate-shimmer { animation: shimmer 2.5s infinite; }
        .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
        .animate-scale-in { animation: scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        
        .delay-100 { animation-delay: 100ms; }

        .confetti-piece {
          position: absolute;
          width: 10px;
          height: 10px;
          background-color: #f00;
          animation: fall 3s linear forwards;
        }
      `}</style>
    </div>
  )
}
