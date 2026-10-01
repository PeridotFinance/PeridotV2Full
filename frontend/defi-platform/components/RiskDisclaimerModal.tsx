"use client"

import { useState, useEffect, useRef } from "react"
import { Shield, AlertTriangle, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useAccount } from 'wagmi'

const DISCLAIMER_STORAGE_KEY = 'peridot-risk-disclaimer-acknowledged'

export function RiskDisclaimerModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [isAcknowledged, setIsAcknowledged] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const { isConnected } = useAccount()

  // Check if user has already acknowledged the disclaimer and wallet is connected
  useEffect(() => {
    if (!isConnected) {
      // Don't show modal if wallet is not connected
      setIsOpen(false)
      return
    }

    try {
      const hasAcknowledged = localStorage.getItem(DISCLAIMER_STORAGE_KEY)
      if (hasAcknowledged !== 'true') {
        setIsOpen(true)
      }
    } catch (error) {
      console.error("Could not access localStorage:", error)
      // If localStorage fails, still show the modal for safety when connected
      setIsOpen(true)
    }
  }, [isConnected])

  // Handle click outside to close (but only if acknowledged)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node) && isAcknowledged) {
        handleAcknowledge()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, isAcknowledged])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isAcknowledged) {
        handleAcknowledge()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, isAcknowledged])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      // Store the current scroll position
      const scrollY = window.scrollY

      // Add class to prevent scrolling
      document.body.classList.add('modal-open')

      // Prevent scroll restoration on iOS
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'

      // Restore scroll position when modal closes
      return () => {
        document.body.classList.remove('modal-open')
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.width = ''
        window.scrollTo(0, scrollY)
      }
    }
  }, [isOpen])

  const handleAcknowledge = () => {
    if (!isAcknowledged) return

    try {
      localStorage.setItem(DISCLAIMER_STORAGE_KEY, 'true')
    } catch (error) {
      console.error("Could not save to localStorage:", error)
    }

    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in-0 duration-300">
      <div
        ref={dialogRef}
        className="w-full max-w-md mx-auto animate-in zoom-in-95 duration-300 h-[85dvh] sm:h-[80vh] max-h-[600px] min-h-[500px] flex flex-col"
      >
        <Card className="relative overflow-hidden border-0 shadow-2xl rounded-2xl bg-white dark:bg-slate-900/90 dark:backdrop-blur-xl border border-slate-200 dark:border-white/20 h-full flex flex-col">
          {/* Dark mode glass overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-white/10 to-transparent hidden dark:block pointer-events-none rounded-2xl" />

          {/* Header */}
          <CardHeader className="relative pb-4 px-6 flex-shrink-0">
            {/* Liquid Glass Header Background */}
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-red-500/10 dark:from-amber-500/20 dark:via-orange-500/10 dark:to-red-500/20 rounded-t-2xl" />
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent dark:from-white/5 dark:to-transparent rounded-t-2xl" />

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-2xl backdrop-blur-sm border border-white/20">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">
                    Risk Disclaimer
                  </CardTitle>
                  <p className="text-sm text-slate-700 dark:text-white/80 font-medium">
                    Important Information
                  </p>
                </div>
              </div>

              {/* Close button - only enabled when acknowledged */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAcknowledge}
                disabled={!isAcknowledged}
                className={cn(
                  "rounded-xl p-2 backdrop-blur-sm border transition-all duration-200",
                  isAcknowledged
                    ? "text-slate-600 dark:text-white/80 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/20 border-slate-200 dark:border-white/10"
                    : "text-slate-400 dark:text-white/40 border-transparent cursor-not-allowed"
                )}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </CardHeader>

          {/* Content */}
          <CardContent className="px-6 pb-6 flex-1 flex flex-col overflow-hidden">
            {/* Warning Banner */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Please read this disclaimer carefully before proceeding.
              </p>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto -mr-2 pr-2 custom-scrollbar">
              <div className="space-y-6 text-sm leading-relaxed">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Smart Contract Risks</h3>
                  <div className="space-y-3 text-slate-700 dark:text-slate-300">
                    <p>
                      DeFi lending involves interacting with smart contracts on blockchain networks. While we implement industry-standard security measures, all smart contract interactions carry inherent risks including:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li><strong>Bug Risks:</strong> Smart contracts may contain undiscovered vulnerabilities</li>
                      <li><strong>Hack Risks:</strong> Blockchain networks and protocols can be exploited</li>
                      <li><strong>Oracle Risks:</strong> Price feeds may be manipulated or fail</li>
                      <li><strong>Liquidity Risks:</strong> Insufficient liquidity may affect your ability to withdraw funds</li>
                      <li><strong>Network Risks:</strong> Blockchain networks may experience outages or congestion</li>
                    </ul>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Lending & Borrowing Risks</h3>
                  <div className="space-y-3 text-slate-700 dark:text-slate-300">
                    <p>
                      Lending and borrowing crypto assets involves additional financial and technical risks:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li><strong>Interest Rate Volatility:</strong> APYs can change rapidly based on market conditions</li>
                      <li><strong>Liquidation Risk:</strong> Borrowed positions may be liquidated if collateral value drops</li>
                      <li><strong>Impermanent Loss:</strong> Complex DeFi strategies may result in losses</li>
                      <li><strong>Regulatory Risk:</strong> DeFi regulations may change affecting platform operations</li>
                      <li><strong>Counterparty Risk:</strong> Other users may default on their obligations</li>
                    </ul>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Asset & Market Risks</h3>
                  <div className="space-y-3 text-slate-700 dark:text-slate-300">
                    <p>
                      Cryptocurrency markets are highly volatile and speculative:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li><strong>Price Volatility:</strong> Crypto asset prices can fluctuate dramatically</li>
                      <li><strong>Total Loss Risk:</strong> You may lose your entire investment</li>
                      <li><strong>Market Manipulation:</strong> Prices may be artificially influenced</li>
                      <li><strong>Scams & Fraud:</strong> The crypto space contains many fraudulent projects</li>
                    </ul>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Your Responsibility</h3>
                  <div className="space-y-3 text-slate-700 dark:text-slate-300">
                    <p>
                      By using Peridot Finance, you acknowledge that:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>You understand the risks involved in DeFi lending and borrowing</li>
                      <li>You are responsible for your own financial decisions</li>
                      <li>You will not deposit more than you can afford to lose</li>
                      <li>You understand that past performance does not guarantee future results</li>
                      <li>You will conduct your own research before depositing funds</li>
                    </ul>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    <strong>Legal Notice:</strong> This is not financial advice. Peridot Finance is a DeFi protocol and does not provide personalized financial recommendations.
                    Always consult with qualified financial advisors and conduct thorough research before participating in DeFi activities.
                  </p>
                </div>
              </div>
            </div>

            {/* Acknowledgment Section */}
            <div className="flex-shrink-0 pt-6 border-t border-slate-100 dark:border-white/5 mt-4">
              <div className="flex items-start gap-3 mb-4">
                <Checkbox
                  id="risk-acknowledgment"
                  checked={isAcknowledged}
                  onCheckedChange={(checked) => setIsAcknowledged(checked === true)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="risk-acknowledgment"
                  className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed cursor-pointer"
                >
                  I have read, understood, and accept the risks described above.
                </label>
              </div>

              <Button
                onClick={handleAcknowledge}
                disabled={!isAcknowledged}
                className={cn(
                  "w-full py-3 rounded-xl font-semibold transition-all duration-200",
                  isAcknowledged
                    ? "bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white shadow-lg shadow-primary/25"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                )}
              >
                <Check className="w-4 h-4 mr-2" />
                I Acknowledge the Risks
              </Button>
            </div>
          </CardContent>

          {/* Background Gradient */}
          <div className="absolute inset-0 -z-10 opacity-5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl" />
        </Card>
      </div>
    </div>
  )
}
