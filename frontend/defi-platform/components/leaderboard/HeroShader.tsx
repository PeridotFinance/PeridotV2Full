'use client'

import { useEffect, useRef } from 'react'

/**
 * HeroShader — monochromer Flow-Field Backdrop hinter dem Leaderboard-Hero.
 *
 * Was passiert technisch:
 *   • WebGL2-Fragment-Shader auf einem Full-Quad
 *   • 2D Simplex Noise → 5-Oktaven FBM → zwei Domain-Warps für ein
 *     "fließendes" Look (Inigo Quilez Pattern, gut auf bekannten
 *     Shadertoy-Demos)
 *   • Output: pure black mit niedrigem Alpha (max ~6%) auf transparentem
 *     Background. Sieht über `bg-white` als unaufdringlich-schimmernde
 *     graue Strömung aus
 *   • Soft edge fades (rechts/oben/unten) damit das Pattern in den Page-
 *     Surface übergeht statt eine sichtbare Kante zu zeigen
 *
 * Warum WebGL2 statt CSS / canvas2d:
 *   • Pure compositor work — der Fragment-Shader läuft auf der GPU,
 *     Main-Thread bleibt frei für React / scroll
 *   • Alpha-Pattern auf 1000×400px @ 60fps = ~24M Pixel-Shader-Invocations
 *     pro Sekunde. CPU canvas2d würde das pro Frame in JS lösen
 *   • Native APIs only — keine three.js / OGL Dep
 *
 * Fallbacks:
 *   • Kein WebGL2 → return (canvas bleibt leer, kein visueller Bruch
 *     dank `bg-white` Parent)
 *   • `prefers-reduced-motion` → kein GL-Context, kein rAF-Loop
 *   • Tab in Background → `IntersectionObserver` / `document.visibilityState`
 *     pausiert die Render-Loop, spart Akku
 */

// ── GLSL ────────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `#version 300 es
in vec4 a_position;
void main() {
  gl_Position = a_position;
}
`

const FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform float u_time;
uniform vec2  u_resolution;
out vec4 outColor;

// ── 2D Simplex noise (Ashima Arts / Stefan Gustavson) ─────────────────────
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187,  0.366025403784439,
                     -0.577350269189626,  0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                          + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x  = 2.0 * fract(p * C.www) - 1.0;
  vec3 h  = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// ── 5-octave FBM ──────────────────────────────────────────────────────────
float fbm(vec2 p) {
  float f = 0.0;
  float a = 0.5;
  // Slightly irrational lacunarity avoids visible repeats / banding
  // on the highest octaves.
  for (int i = 0; i < 5; i++) {
    f += a * snoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return f;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;        // 0..1
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 2.4;            // sample scale

  // Slow drift — full pattern cycles in ~5 minutes which the eye reads
  // as "always different" without the distracting churn of fast noise.
  float t = u_time * 0.035;

  // Two-stage domain warp → fluid streamline look (after IQ)
  vec2 q;
  q.x = fbm(p + vec2(t * 0.7, 0.0));
  q.y = fbm(p + vec2(5.2, 1.3) + vec2(0.0, t * 0.6));

  vec2 r;
  r.x = fbm(p + q * 1.4 + vec2(1.7, 9.2) + vec2(t * 0.3, 0.0));
  r.y = fbm(p + q * 1.4 + vec2(8.3, 2.8) + vec2(0.0, t * 0.4));

  float f = fbm(p + r * 1.0);

  // Compress the response so most of the canvas is faint and only the
  // "ridges" of the flow get any contrast. Power curve = subtle highlight.
  float v = smoothstep(0.0, 0.6, f);
  v = pow(v, 1.6);

  // Cap maximum alpha at ~7% black so the pattern stays restrained
  // even at the brightest pixels — Trade Republic, not poster.
  v *= 0.07;

  // ── Edge fades ─────────────────────────────────────────────────────────
  // Right half fades to zero — the hero's right-side "Your points" card
  // sits there with bg-white; we don't want the pattern peeking out from
  // under it on different viewport widths.
  float fadeRight = smoothstep(1.0, 0.45, uv.x);
  // Soft fade at the very bottom so the pattern dissolves before the
  // page section divider.
  float fadeBottom = smoothstep(0.0, 0.35, uv.y);
  // Tiny fade at the top so the pattern doesn't meet the (semi-transparent)
  // site header with a hard line.
  float fadeTop = smoothstep(1.0, 0.78, uv.y);

  v *= fadeRight * fadeBottom * fadeTop;

  outColor = vec4(0.0, 0.0, 0.0, v);
}
`

// ── React component ─────────────────────────────────────────────────────────

export function HeroShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Honor reduced motion — never spin up the GL context.
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    // `low-power` powerPreference: on dual-GPU laptops this picks the
    // integrated GPU. A subtle backdrop shader does not justify the
    // wattage cost of waking the discrete GPU.
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    }) as WebGL2RenderingContext | null
    if (!gl) return

    // ── Compile + link ─────────────────────────────────────────────────────
    const program = createProgram(gl, VERT, FRAG)
    if (!program) return
    gl.useProgram(program)

    // Full-screen triangle (single 3-vertex draw covers the viewport).
    const posLoc = gl.getAttribLocation(program, 'a_position')
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    )
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(program, 'u_time')
    const uRes = gl.getUniformLocation(program, 'u_resolution')

    // ── Sizing ────────────────────────────────────────────────────────────
    // Cap effective DPR at 1.5 — the pattern is so low-frequency that
    // sampling above 1.5× costs GPU without visible benefit, and the
    // alpha blending hides any aliasing.
    const dpr = Math.min(
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      1.5,
    )

    function resize() {
      const rect = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.floor(rect.width * dpr))
      const h = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      gl.uniform2f(uRes, w, h)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    // ── Render loop ────────────────────────────────────────────────────────
    // Throttle to ~30fps. The pattern's drift is slow enough that
    // double the framerate provides zero perceived benefit, while
    // halving it doubles battery life on the shader.
    const targetFrameMs = 1000 / 30
    let rafId = 0
    let lastFrameAt = 0
    let visible = true
    const startedAt = performance.now()

    function frame(now: number) {
      rafId = requestAnimationFrame(frame)
      if (!visible) return
      if (now - lastFrameAt < targetFrameMs) return
      lastFrameAt = now
      const elapsed = (now - startedAt) / 1000
      gl.uniform1f(uTime, elapsed)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    rafId = requestAnimationFrame(frame)

    // Pause when tab is in background — no point burning cycles when
    // the user can't see the canvas.
    const onVisibilityChange = () => {
      visible = document.visibilityState === 'visible'
      if (visible) lastFrameAt = 0
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Pause when the canvas is offscreen (e.g., user scrolled to
    // the Profile tab and the Hero is no longer visible).
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          visible =
            e.isIntersecting && document.visibilityState === 'visible'
          if (visible) lastFrameAt = 0
        }
      },
      { rootMargin: '50px' },
    )
    io.observe(canvas)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      gl.deleteBuffer(buf)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 w-full h-full"
    />
  )
}

// ── GL helpers ──────────────────────────────────────────────────────────────

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[HeroShader] shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource)
  if (!vs || !fs) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[HeroShader] program link error:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  // Shaders are now linked into the program; the individual objects
  // are no longer needed.
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return program
}
