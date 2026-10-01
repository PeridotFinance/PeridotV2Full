"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface CyberToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  className?: string
}

export function CyberToggle({ checked, onChange, label, className }: CyberToggleProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {label && (
        <span className="text-cyber-text-secondary text-sm font-inter font-medium">
          {label}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("cyber-toggle", checked && "active")}
      >
        <span className="sr-only">{label || "Toggle"}</span>
      </button>
    </div>
  )
}









