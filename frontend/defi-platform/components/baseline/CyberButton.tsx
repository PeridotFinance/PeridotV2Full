"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface CyberButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "ghost"
  size?: "sm" | "md" | "lg"
}

export function CyberButton({
  children,
  className,
  variant = "primary",
  size = "md",
  ...props
}: CyberButtonProps) {
  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  }

  const variantClasses = {
    primary: "cyber-button",
    secondary: "bg-cyber-bg-card border border-cyber-accent-primary text-cyber-accent-primary hover:bg-cyber-bg-hover",
    ghost: "bg-transparent text-cyber-text-primary hover:bg-cyber-bg-hover",
  }

  return (
    <button
      className={cn(
        "rounded-cyber-md font-inter font-medium transition-all duration-200",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}









