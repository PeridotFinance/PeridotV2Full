'use client'

import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

interface Cell {
  label: string
  risk: number // 0-1
  value: number
}

interface RiskHeatmapProps {
  data: {
    cells: Cell[]
    columns?: number
  }
}

function HeatmapCell({
  position,
  risk,
  size,
}: {
  position: [number, number, number]
  risk: number
  size: number
}) {
  const color = useMemo(() => {
    const c = new THREE.Color()
    c.setHSL(0.33 - risk * 0.33, 0.8, 0.4 + risk * 0.2)
    return c
  }, [risk])

  return (
    <mesh position={position}>
      <boxGeometry args={[size * 0.9, 0.1 + risk * 0.6, size * 0.9]} />
      <meshStandardMaterial color={color} transparent opacity={0.9} emissive={color} emissiveIntensity={risk * 0.3} />
    </mesh>
  )
}

export default function RiskHeatmap({ data }: RiskHeatmapProps) {
  const { cells = [], columns = 4 } = data
  const cellSize = 3 / columns

  const positions = useMemo(() => {
    return cells.map((cell, i) => {
      const col = i % columns
      const row = Math.floor(i / columns)
      const x = (col - (columns - 1) / 2) * cellSize
      const z = (row - (Math.ceil(cells.length / columns) - 1) / 2) * cellSize
      const y = 0.05 + cell.risk * 0.3
      return { position: [x, y, z] as [number, number, number], risk: cell.risk }
    })
  }, [cells, columns, cellSize])

  return (
    <Canvas
      camera={{ position: [0, 4, 3], fov: 45 }}
      style={{ height: 220 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 3]} intensity={0.6} />
      {positions.map((p, i) => (
        <HeatmapCell key={i} position={p.position} risk={p.risk} size={cellSize} />
      ))}
      <gridHelper
        args={[3, columns, '#333', '#222']}
        position={[0, 0, 0]}
      />
      <OrbitControls enableZoom={false} enablePan={false} />
    </Canvas>
  )
}
