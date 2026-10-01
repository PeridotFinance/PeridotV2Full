"use client"

import { useEffect, useState } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getMuted, setMuted, warmupAudio } from "@/lib/sound"

export function SoundToggle({ className = "" }: { className?: string }) {
  const [muted, setMutedState] = useState<boolean>(() => {
    // Only use localStorage if it exists, otherwise default to true (muted)
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('peridot_sound_muted')
      if (stored !== null) {
        return stored === '1' // true if '1', false if '0'
      }
    }
    return true // Default to muted for new users
  })

  // Remove the useEffect since we're handling it in useState

  const toggle = () => {
    warmupAudio()
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={`h-9 w-9 rounded-full ${className}`}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
    >
      {muted ? (
        <VolumeX className="h-[1.1rem] w-[1.1rem]" />
      ) : (
        <Volume2 className="h-[1.1rem] w-[1.1rem]" />
      )}
    </Button>
  )
}


