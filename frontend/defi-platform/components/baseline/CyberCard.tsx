"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface CyberCardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  size?: "sm" | "md" | "lg"
}

export function CyberCard({ children, className, hover = true, size = "md" }: CyberCardProps) {
  const sizeClasses = {
    sm: "rounded-cyber-md",
    md: "rounded-cyber-lg",
    lg: "rounded-cyber-lg",
  }

  return (
    <div
      className={cn(
        "cyber-card",
        sizeClasses[size],
        hover && "cyber-card",
        "p-6 md:p-8",
        className
      )}
    >
      {children}
    </div>
  )
}









