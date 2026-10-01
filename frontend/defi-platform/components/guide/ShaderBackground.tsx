"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"

/**
 * A calm, slowly-drifting WebGL gradient field in Peridot's emerald/teal,
 * the "chill shader" backdrop for the App Handbook. Domain-warped sine noise
 * keeps it smooth and dependency-free (no three.js).
 *
 * Degrades gracefully: if WebGL is unavailable or the user prefers reduced
 * motion, it paints a single static frame (or nothing) and never animates.
 * The canvas sits behind everything at low opacity with a radial edge fade, so
 * content stays perfectly readable.
 */
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_t;
uniform float u_dark; // 1.0 = dark theme, 0.0 = light theme

// Soft domain-warped field: layered sines, no texture lookups, compiles
// everywhere. A slow emerald→teal flow over a deep base (dark) or a pastel
// mint flow over near-white (light).
void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  // Keep the motion gentle: aspect-correct so blobs don't smear on wide screens.
  vec2 p = uv;
  p.x *= u_res.x / u_res.y;

  float t = u_t * 0.045;

  // domain warp
  float w = sin(p.x * 2.2 + t) * 0.5 + cos(p.y * 1.9 - t * 0.8) * 0.5;
  float f = sin((p.x + w) * 3.2 + t) * cos((p.y - w) * 2.6 - t * 1.1);
  f = f * 0.5 + 0.5;

  float blob = sin(p.x * 1.6 + t * 0.6) * sin(p.y * 1.7 - t * 0.45);
  float mixv = clamp(f * 0.65 + blob * 0.2 + 0.28, 0.0, 1.0);

  // Theme palettes.
  vec3 deep    = mix(vec3(0.965, 0.980, 0.972), vec3(0.015, 0.045, 0.040), u_dark);
  vec3 emerald = mix(vec3(0.780, 0.925, 0.840), vec3(0.055, 0.420, 0.300), u_dark);
  vec3 teal    = mix(vec3(0.800, 0.910, 0.930), vec3(0.020, 0.340, 0.400), u_dark);

  vec3 col = mix(deep, emerald, mixv);
  col = mix(col, teal, blob * 0.22 + 0.2);

  gl_FragColor = vec4(col, 1.0);
}
`

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh)
    return null
  }
  return sh
}

export function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Default to dark (the app is dark-first) until next-themes resolves.
    const dark = resolvedTheme !== "light"

    const gl =
      (canvas.getContext("webgl", { antialias: false, depth: false }) as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null)
    if (!gl) return // CSS fallback styling on the element handles the empty case.

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return

    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)

    // Fullscreen triangle.
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, "a_pos")
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, "u_res")
    const uT = gl.getUniformLocation(prog, "u_t")
    gl.uniform1f(gl.getUniformLocation(prog, "u_dark"), dark ? 1 : 0)

    // Cap DPR, because this is a soft backdrop and full retina is wasted GPU.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    function resize() {
      const w = Math.floor(canvas.clientWidth * dpr)
      const h = Math.floor(canvas.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
      gl.uniform2f(uRes, w, h)
    }
    resize()
    window.addEventListener("resize", resize)

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let raf = 0
    const start = performance.now()

    function frame(now: number) {
      resize()
      gl.uniform1f(uT, (now - start) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }

    if (reduced) {
      // One static frame, no loop.
      gl.uniform1f(uT, 8)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    } else {
      // Pause when the tab is hidden to save battery.
      const onVis = () => {
        if (document.hidden) {
          cancelAnimationFrame(raf)
        } else {
          raf = requestAnimationFrame(frame)
        }
      }
      document.addEventListener("visibilitychange", onVis)
      raf = requestAnimationFrame(frame)

      return () => {
        cancelAnimationFrame(raf)
        window.removeEventListener("resize", resize)
        document.removeEventListener("visibilitychange", onVis)
      }
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
    // Re-init on theme change so the palette uniform updates.
  }, [resolvedTheme])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full opacity-60 [mask-image:radial-gradient(120%_90%_at_50%_0%,#000_25%,transparent_85%)]"
      />
      {/* Veil so foreground text always has contrast, on either theme. */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
    </div>
  )
}
