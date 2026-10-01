"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

import { cn } from "@/lib/utils"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ toastOptions, closeButton, className, ...props }: ToasterProps) => {
  const { theme, resolvedTheme } = useTheme()
  const effectiveTheme = (resolvedTheme || theme || "dark") as ToasterProps["theme"]

  const resolvedCloseButton = closeButton ?? toastOptions?.closeButton ?? true

  return (
    <Sonner
      theme={effectiveTheme}
      className={cn("toaster group", className)}
      closeButton={resolvedCloseButton}
      toastOptions={{
        ...(toastOptions ?? {}),
        closeButton: toastOptions?.closeButton ?? resolvedCloseButton,
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
