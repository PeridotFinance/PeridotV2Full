import React from 'react'
import { motion } from 'framer-motion'

interface LoadingCubesProps {
  className?: string
  loadingText?: string
}

export const LoadingCubes: React.FC<LoadingCubesProps> = ({ 
  className = '', 
  loadingText = 'Loading Peridot DeFi' 
}) => {
  return (
    <motion.div 
      className={`fixed inset-0 z-[999] flex items-center justify-center bg-background/95 backdrop-blur-sm ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* 3D Cubes Animation */}
      <div className="cubes-container">
        <div className="loop cubes">
          <div className="item cubes"></div>
          <div className="item cubes"></div>
          <div className="item cubes"></div>
          <div className="item cubes"></div>
          <div className="item cubes"></div>
          <div className="item cubes"></div>
        </div>
      </div>

      {/* Loading Text */}
      <motion.div 
        className="absolute bottom-1/3 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      >
        <h2 className="text-xl font-semibold mb-2 bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
          {loadingText}
        </h2>
        <p className="text-sm text-muted-foreground">
          Initializing cross-chain protocols...
        </p>
      </motion.div>

      <style jsx>{`
        .cubes {
          position: absolute;
          top: 50%;
          left: 50%;
          transform-style: preserve-3d;
        }

        .loop {
          transform: rotateX(-35deg) rotateY(-45deg) translateZ(1.5625em);
        }

        @keyframes s {
          to {
            transform: scale3d(0.2, 0.2, 0.2);
          }
        }

        .item {
          margin: -1.5625em;
          width: 3.125em;
          height: 3.125em;
          transform-origin: 50% 50% -1.5625em;
          box-shadow: 0 0 0.125em currentColor;
          background: currentColor;
          animation: s 0.6s cubic-bezier(0.45, 0.03, 0.51, 0.95) infinite alternate;
        }

        .item:before,
        .item:after {
          position: absolute;
          width: inherit;
          height: inherit;
          transform-origin: 0 100%;
          box-shadow: inherit;
          background: currentColor;
          content: "";
        }

        .item:before {
          bottom: 100%;
          transform: rotateX(90deg);
        }

        .item:after {
          left: 100%;
          transform: rotateY(90deg);
        }

        .item:nth-child(1) {
          margin-top: 6.25em;
          color: #10b981;
          animation-delay: -1.2s;
        }

        .item:nth-child(1):before {
          color: #34d399;
        }

        .item:nth-child(1):after {
          color: #22c55e;
        }

        .item:nth-child(2) {
          margin-top: 3.125em;
          color: #059669;
          animation-delay: -1s;
        }

        .item:nth-child(2):before {
          color: #10b981;
        }

        .item:nth-child(2):after {
          color: #047857;
        }

        .item:nth-child(3) {
          margin-top: 0em;
          color: #3b82f6;
          animation-delay: -0.8s;
        }

        .item:nth-child(3):before {
          color: #60a5fa;
        }

        .item:nth-child(3):after {
          color: #2563eb;
        }

        .item:nth-child(4) {
          margin-top: -3.125em;
          color: #1d4ed8;
          animation-delay: -0.6s;
        }

        .item:nth-child(4):before {
          color: #3b82f6;
        }

        .item:nth-child(4):after {
          color: #1e40af;
        }

        .item:nth-child(5) {
          margin-top: -6.25em;
          color: #7c3aed;
          animation-delay: -0.4s;
        }

        .item:nth-child(5):before {
          color: #a855f7;
        }

        .item:nth-child(5):after {
          color: #6d28d9;
        }

        .item:nth-child(6) {
          margin-top: -9.375em;
          color: #9333ea;
          animation-delay: -0.2s;
        }

        .item:nth-child(6):before {
          color: #c084fc;
        }

        .item:nth-child(6):after {
          color: #8b5cf6;
        }
      `}</style>
    </motion.div>
  )
} 