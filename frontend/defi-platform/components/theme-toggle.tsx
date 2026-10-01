"use client"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { setTheme, theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Migrate users from "system" to "dark" on mount
  useEffect(() => {
    if (mounted && theme === "system") {
      setTheme("dark")
    }
  }, [mounted, theme, setTheme])

  // Function to cycle through themes: light <-> dark
  const handleThemeToggle = () => {
    if (theme === "light") {
      setTheme("dark")
    } else {
      setTheme("light")
    }
  }

  // Don't render until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-full relative touch-manipulation group"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 opacity-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    )
  }

  // Use resolvedTheme for more reliable theme detection
  const currentTheme = resolvedTheme || theme

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 rounded-full relative touch-manipulation group"
      onClick={handleThemeToggle}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Sun className={`h-[1.2rem] w-[1.2rem] transition-all duration-500 ease-in-out ${
        currentTheme === "light" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
      }`} />
      <Moon className={`absolute h-[1.2rem] w-[1.2rem] transition-all duration-500 ease-in-out ${
        currentTheme === "dark" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0"
      }`} />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
