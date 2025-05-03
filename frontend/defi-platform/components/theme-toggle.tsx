"use client"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const [open, setOpen] = useState(false)

  // Function to handle theme change and close dropdown
  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme)
    setOpen(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9 rounded-full relative touch-manipulation"
          onClick={() => setOpen(true)}
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="z-[101] touch-manipulation" 
        sideOffset={8}
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <DropdownMenuItem 
          className="cursor-pointer" 
          onClick={() => handleThemeChange("light")}
        >
          Light
        </DropdownMenuItem>
        <DropdownMenuItem 
          className="cursor-pointer" 
          onClick={() => handleThemeChange("dark")}
        >
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem 
          className="cursor-pointer" 
          onClick={() => handleThemeChange("system")}
        >
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
