'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useReducedMotion } from '@/lib/use-reduced-motion'

interface CrystalLatticeBackgroundProps {
  className?: string
  /**
   * Overall strength multiplier (0 → invisible, 1 → max). Default 0.55 keeps
   * the effect ambient and never competes with chat content for attention.
   */
  intensity?: number
}

/**
 * Adapted from the "Crystal Lattice" voronoi shader. Renders ONLY the
 * facets + mouse aura with translucent alpha so the page's existing
 * bg-background shows through unchanged. No theme detection needed —
 * the underlying surface handles light/dark.
 *
 * Pointer-events disabled: the canvas listens to window-level events so
 * clicks pass through to the chat below.
 */
export function CrystalLatticeBackground({
  className,
  intensity = 0.55,
}: CrystalLatticeBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { prefersReducedMotion, isLowPerfDevice } = useReducedMotion()

  useEffect(() => {
    if (prefersReducedMotion || isLowPerfDevice) return
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      antialias: false,
      premultipliedAlpha: false,
      alpha: true,
    })
    if (!gl) return

    const VERT = `
      attribute vec2 a_pos;
      void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
    `

    const FRAG = `
      precision highp float;
      uniform vec2 u_res;
      uniform vec2 u_mouse;
      uniform float u_time;
      uniform float u_pulse;
      uniform vec2 u_pulsePos;
      uniform float u_intensity;
      uniform vec3 u_tint;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      vec2 hash22(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy);
      }
      vec3 voronoi(vec2 p) {
        vec2 ip = floor(p), fp = fract(p);
        float F1 = 8.0, F2 = 8.0;
        vec2 closest = vec2(0.0);
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash22(ip + g);
            o = 0.5 + 0.5 * sin(u_time * 0.25 + 6.28 * o);
            vec2 r = g + o - fp;
            float d = dot(r, r);
            if (d < F1) { F2 = F1; F1 = d; closest = g + o; }
            else if (d < F2) { F2 = d; }
          }
        }
        return vec3(sqrt(F1), sqrt(F2), hash12(ip + closest));
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
        vec2 m  = (u_mouse        - 0.5 * u_res) / min(u_res.x, u_res.y);

        // Mild lensing toward the cursor
        vec2 p = uv;
        float toM = length(uv - m);
        p -= (uv - m) * exp(-toM * 1.8) * 0.14;

        // Click shockwave (subtle)
        float rd = length(uv - u_pulsePos);
        p += normalize(uv - u_pulsePos + 0.0001)
           * u_pulse * 0.10
           * sin(rd * 14.0 - u_time * 7.0)
           * exp(-rd * 1.4);

        // Two scales for crystal facets
        vec3 v  = voronoi(p * 4.0  + u_time * 0.04);
        vec3 v2 = voronoi(p * 9.5  - u_time * 0.07);

        // Edges (F2 - F1) trace the cell facets
        float edge  = smoothstep(0.025, 0.0, v.y  - v.x);
        float edge2 = smoothstep(0.045, 0.0, v2.y - v2.x);

        // Color comes ONLY from the tint — the page bg shows through gaps.
        vec3 col = u_tint * (edge * 0.85 + edge2 * 0.30);

        // Soft cell glow biased by hash so facets aren't uniform
        col += u_tint * (1.0 - smoothstep(0.0, 0.32, v.x)) * 0.18 * v.z;

        // Mouse aura — gentle peridot bloom following the cursor
        col += exp(-toM * 2.6) * u_tint * 0.45;

        // Click flash — slightly brighter so the user feels the interaction
        col += u_pulse * exp(-rd * 3.2) * u_tint * 0.85;

        // Soft outer fade so corners don't compete with chat
        float vignette = 1.0 - smoothstep(0.55, 1.35, length(uv)) * 0.55;
        col *= vignette;

        // Premultiply-free output: alpha tracks edge density + aura
        float alpha =
          (edge * 0.8 + edge2 * 0.32) * 0.55
          + exp(-toM * 2.6) * 0.20
          + u_pulse * exp(-rd * 3.2) * 0.6;
        alpha = clamp(alpha * vignette, 0.0, 0.78);

        // Master attenuation
        col   *= u_intensity;
        alpha *= u_intensity;

        gl_FragColor = vec4(col, alpha);
      }
    `

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)
      if (!s) return null
      gl!.shaderSource(s, src)
      gl!.compileShader(s)
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
        // eslint-disable-next-line no-console
        console.warn('[crystal-lattice] shader error:', gl!.getShaderInfoLog(s))
        gl!.deleteShader(s)
        return null
      }
      return s
    }

    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return

    const prog = gl.createProgram()
    if (!prog) return
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      // eslint-disable-next-line no-console
      console.warn('[crystal-lattice] link error:', gl.getProgramInfoLog(prog))
      return
    }

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    )

    const a_pos = gl.getAttribLocation(prog, 'a_pos')
    const u_res = gl.getUniformLocation(prog, 'u_res')
    const u_mouse = gl.getUniformLocation(prog, 'u_mouse')
    const u_time = gl.getUniformLocation(prog, 'u_time')
    const u_pulse = gl.getUniformLocation(prog, 'u_pulse')
    const u_pulsePos = gl.getUniformLocation(prog, 'u_pulsePos')
    const u_intensity = gl.getUniformLocation(prog, 'u_intensity')
    const u_tint = gl.getUniformLocation(prog, 'u_tint')

    // Peridot mint (HSL 150 59% 48% → ~rgb(52, 201, 135))
    const TINT: readonly [number, number, number] = [0.205, 0.79, 0.53]

    let w = 0
    let h = 0
    let dpr = 1
    const state = {
      mouseRaw: [0, 0],
      mouse: [0, 0],
      pulse: 0,
      pulsePosUV: [0, 0],
      tStart: performance.now(),
    }

    function resize() {
      const next = Math.min(window.devicePixelRatio || 1, 1.5)
      const cw = canvas!.clientWidth || window.innerWidth
      const ch = canvas!.clientHeight || window.innerHeight
      const newW = Math.max(1, Math.floor(cw * next))
      const newH = Math.max(1, Math.floor(ch * next))
      if (newW === w && newH === h && next === dpr) return
      w = newW
      h = newH
      dpr = next
      canvas!.width = w
      canvas!.height = h
      // Center cursor on first sizing — no jarring jump from 0,0.
      if (state.mouseRaw[0] === 0 && state.mouseRaw[1] === 0) {
        state.mouseRaw = [w / 2, h / 2]
        state.mouse = [w / 2, h / 2]
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    function setMouseFromEvent(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      // Outside the canvas: drift mouse back to center so the aura calmly
      // recedes instead of locking to the last edge position.
      if (
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom
      ) {
        state.mouseRaw = [w / 2, h / 2]
        return
      }
      const x = (e.clientX - rect.left) * dpr
      // WebGL y-axis is inverted relative to DOM
      const y = (rect.height - (e.clientY - rect.top)) * dpr
      state.mouseRaw = [x, y]
    }
    function onPointerDown(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect()
      if (
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom
      ) {
        return
      }
      setMouseFromEvent(e)
      state.pulse = 1.0
      const minSide = Math.min(w, h)
      state.pulsePosUV = [
        (state.mouseRaw[0] - w / 2) / minSide,
        (state.mouseRaw[1] - h / 2) / minSide,
      ]
    }
    window.addEventListener('pointermove', setMouseFromEvent)
    window.addEventListener('pointerdown', onPointerDown)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)

    let raf = 0
    let visible = true
    function onVisibility() {
      visible = !document.hidden
    }
    document.addEventListener('visibilitychange', onVisibility)

    function frame(nowMs: number) {
      raf = requestAnimationFrame(frame)
      if (!visible) return

      const t = (nowMs - state.tStart) / 1000
      const k = 0.10
      state.mouse[0] += (state.mouseRaw[0] - state.mouse[0]) * k
      state.mouse[1] += (state.mouseRaw[1] - state.mouse[1]) * k
      state.pulse *= 0.952

      gl!.viewport(0, 0, w, h)
      gl!.clear(gl!.COLOR_BUFFER_BIT)
      gl!.useProgram(prog)
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buf)
      gl!.enableVertexAttribArray(a_pos)
      gl!.vertexAttribPointer(a_pos, 2, gl!.FLOAT, false, 0, 0)
      gl!.uniform2f(u_res, w, h)
      gl!.uniform2f(u_mouse, state.mouse[0], state.mouse[1])
      gl!.uniform1f(u_time, t)
      gl!.uniform1f(u_pulse, state.pulse)
      gl!.uniform2f(u_pulsePos, state.pulsePosUV[0], state.pulsePosUV[1])
      gl!.uniform1f(u_intensity, intensity)
      gl!.uniform3f(u_tint, TINT[0], TINT[1], TINT[2])
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pointermove', setMouseFromEvent)
      window.removeEventListener('pointerdown', onPointerDown)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [prefersReducedMotion, isLowPerfDevice, intensity])

  // Reduced-motion / low-perf fallback: a static mint-tinted gradient.
  if (prefersReducedMotion || isLowPerfDevice) {
    return (
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 pointer-events-none',
          'bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.06),transparent_55%),radial-gradient(circle_at_70%_80%,hsl(var(--primary)/0.05),transparent_60%)]',
          className,
        )}
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn(
        'absolute inset-0 w-full h-full pointer-events-none',
        className,
      )}
    />
  )
}
