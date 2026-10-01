'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

interface Sector {
  label: string
  percentage: number
  color: string
}

interface PortfolioSphereProps {
  data: {
    sectors: Sector[]
  }
}

function SphereSegment({
  startAngle,
  endAngle,
  color,
}: {
  startAngle: number
  endAngle: number
  color: string
}) {
  const meshRef = useRef<THREE.Mesh>(null)

  const geometry = useMemo(() => {
    const phiStart = startAngle
    const phiLength = endAngle - startAngle
    return new THREE.SphereGeometry(1.2, 32, 32, phiStart, phiLength)
  }, [startAngle, endAngle])

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.1
    }
  })

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial color={color} transparent opacity={0.85} roughness={0.4} />
    </mesh>
  )
}

export default function PortfolioSphere({ data }: PortfolioSphereProps) {
  const sectors = data.sectors ?? []

  const segments = useMemo(() => {
    const result: { startAngle: number; endAngle: number; color: string }[] = []
    let currentAngle = 0
    for (const sector of sectors) {
      const angle = (sector.percentage / 100) * Math.PI * 2
      result.push({
        startAngle: currentAngle,
        endAngle: currentAngle + angle,
        color: sector.color,
      })
      currentAngle += angle
    }
    return result
  }, [sectors])

  return (
    <Canvas
      camera={{ position: [0, 0, 3.5], fov: 45 }}
      style={{ height: 220 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 3, 5]} intensity={0.8} />
      {segments.map((seg, i) => (
        <SphereSegment
          key={i}
          startAngle={seg.startAngle}
          endAngle={seg.endAngle}
          color={seg.color}
        />
      ))}
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={1} />
    </Canvas>
  )
}
