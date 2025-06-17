'use client'

import { StagewiseToolbar as StagewiseToolbarNext } from '@stagewise/toolbar-next'
import { ReactPlugin } from '@stagewise-plugins/react'

export function StagewiseToolbar() {
  return (
    <StagewiseToolbarNext 
      config={{
        plugins: [ReactPlugin]
      }}
    />
  )
} 