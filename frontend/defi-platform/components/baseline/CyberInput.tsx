"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface CyberInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function CyberInput({ label, error, className, ...props }: CyberInputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-cyber-text-secondary text-sm font-inter font-medium mb-2">
          {label}
        </label>
      )}
      <input
        className={cn(
          "cyber-input w-full font-inter",
          error && "border-cyber-critical",
          className
        )}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-cyber-critical font-inter">{error}</p>
      )}
    </div>
  )
}









