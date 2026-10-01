"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Award } from "lucide-react"
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'

const COOLDOWN_PERIOD = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
const RISK_DISCLAIMER_KEY = 'peridot-risk-disclaimer-acknowledged'

export function DemoDataModal() {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const { isConnected } = useAccount()

  useEffect(() => {
    if (isConnected) {
      // Don't show referral modal if risk disclaimer hasn't been acknowledged yet
      const hasAcknowledgedRisks = localStorage.getItem(RISK_DISCLAIMER_KEY) === 'true'
      if (!hasAcknowledgedRisks) {
        return
      }

      const lastSeenTimestamp = localStorage.getItem("peridot-referral-modal-last-seen")
      const now = new Date().getTime()

      if (!lastSeenTimestamp || (now - parseInt(lastSeenTimestamp, 10) > COOLDOWN_PERIOD)) {
        setIsOpen(true)
      }
    }
  }, [isConnected])

  const handleClose = () => {
    setIsOpen(false)
    localStorage.setItem("peridot-referral-modal-last-seen", new Date().getTime().toString())
  }

  const handleGoToInvite = () => {
    router.push('/app/invite')
    handleClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-green-500" />
            Invite Friends, Earn Rewards
          </DialogTitle>
          <DialogDescription className="text-left">
            Welcome to Peridot Finance! Invite a friend, and when they keep $100 deposited on
            Stellar for 30 days, you both earn $5.
            <br /><br />
            Click the button below to get your unique referral link and start earning.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Maybe Later
          </Button>
          <Button onClick={handleGoToInvite}>
            Get Referral Link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 