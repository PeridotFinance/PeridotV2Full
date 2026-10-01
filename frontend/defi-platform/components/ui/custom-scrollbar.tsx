"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface CustomScrollbarProps {
  children: React.ReactNode
  className?: string
  maxHeight?: string
}

export function CustomScrollbar({ 
  children, 
  className,
  maxHeight = "400px"
}: CustomScrollbarProps) {
  return (
    <div 
      className={cn(
        "custom-scrollbar overflow-y-auto overflow-x-hidden",
        className
      )}
      style={{ 
        maxHeight,
        scrollbarWidth: 'thin',
        scrollbarColor: 'hsl(var(--muted-foreground) / 0.2) transparent'
      }}
    >
      {children}
    </div>
  )
}
