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
import { AlertTriangle } from "lucide-react"

export function DemoDataModal() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    // Check if user has already dismissed this modal
    const hasSeenModal = localStorage.getItem("peridot-demo-modal-seen")
    if (!hasSeenModal) {
      setIsOpen(true)
    }
  }, [])

  const handleClose = () => {
    setIsOpen(false)
    localStorage.setItem("peridot-demo-modal-seen", "true")
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Demo Mode
          </DialogTitle>
          <DialogDescription className="text-left">
            Welcome to Peridot Finance! Please note that all data displayed in this application is mock/demo data for demonstration purposes only. 
            <br /><br />
            This includes balances, transactions, and all financial information shown.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button onClick={handleClose}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 