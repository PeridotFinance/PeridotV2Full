"use client"

import { useState, useEffect } from 'react';

export function AuroraPointerEffect() {
  const [pointerPosition, setPointerPosition] = useState({ x: -200, y: -200 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPointerPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div
      id="aurora-pointer"
      style={{
        // @ts-ignore
        '--x': `${pointerPosition.x}px`,
        '--y': `${pointerPosition.y}px`,
      }}
    />
  );
} 