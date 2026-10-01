'use client'

import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

interface DataPoint {
  x: number
  z: number
  apy: number
  risk: number // 0-1
}

interface YieldLandscapeProps {
  data: {
    points: DataPoint[]
    gridSize?: number
  }
}

function Terrain({ points, gridSize = 8 }: { points: DataPoint[]; gridSize: number }) {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(4, 4, gridSize - 1, gridSize - 1)
    geo.rotateX(-Math.PI / 2)

    const positions = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(positions.count * 3)

    for (let i = 0; i < positions.count; i++) {
      const point = points[i % points.length]
      const height = point ? (point.apy / 20) * 1.5 : 0
      positions.setY(i, height)

      // Color: green (low risk) → red (high risk)
      const risk = point?.risk ?? 0.5
      colors[i * 3] = risk
      colors[i * 3 + 1] = 1 - risk
      colors[i * 3 + 2] = 0.2
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [points, gridSize])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors roughness={0.6} />
    </mesh>
  )
}

export default function YieldLandscape({ data }: YieldLandscapeProps) {
  const { points = [], gridSize = 8 } = data

  return (
    <Canvas
      camera={{ position: [3, 3, 3], fov: 50 }}
      style={{ height: 220 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={0.7} />
      <Terrain points={points} gridSize={gridSize} />
      <gridHelper args={[4, gridSize, '#444', '#333']} position={[0, -0.01, 0]} />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
    </Canvas>
  )
}
