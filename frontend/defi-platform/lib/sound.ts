// Lightweight Web Audio sound manager for UI feedback
// Creates a singleton AudioContext lazily on first play

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let isMuted = true
const SOUND_MUTED_KEY = 'peridot_sound_muted'

// Initialize mute state from localStorage on module load (client only)
if (typeof window !== 'undefined') {
  try {
    const stored = window.localStorage.getItem(SOUND_MUTED_KEY)
    if (stored === '0') {
      isMuted = false
    }
  } catch {}
}

const ensureContext = () => {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      masterGain = audioCtx.createGain()
      masterGain.gain.value = 0.4
      masterGain.connect(audioCtx.destination)
    } catch {
      return null
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

const now = () => (audioCtx ? audioCtx.currentTime : 0)

const scheduleEnvelope = (gain: GainNode, startTime: number, {
  attack = 0.005,
  decay = 0.08,
  sustain = 0.2,
  release = 0.12,
  peak = 1.0,
}: { attack?: number; decay?: number; sustain?: number; release?: number; peak?: number }) => {
  const t0 = startTime
  const t1 = t0 + attack
  const t2 = t1 + decay
  gain.gain.cancelScheduledValues(t0)
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(peak, t1)
  gain.gain.linearRampToValueAtTime(peak * sustain, t2)
  return { t2, release }
}

const playTone = (
  frequency: number,
  durationSec: number,
  type: OscillatorType = 'sine',
  volume = 0.7,
  env?: Partial<{ attack: number; decay: number; sustain: number; release: number; peak: number }>,
  detuneCents = 0
) => {
  const ctx = ensureContext()
  if (!ctx || !masterGain || isMuted) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = frequency
  osc.detune.value = detuneCents

  const startTime = now() + 0.001
  const { t2, release } = scheduleEnvelope(gain, startTime, {
    attack: 0.005,
    decay: 0.05,
    sustain: 0.25,
    release: 0.08,
    peak: 1.0,
    ...env,
  })

  gain.gain.setValueAtTime(gain.gain.value, startTime)
  gain.gain.setValueAtTime(gain.gain.value * volume, startTime)

  osc.connect(gain)
  gain.connect(masterGain)

  osc.start(startTime)
  const stopTime = Math.max(startTime + durationSec, t2 + release)
  gain.gain.linearRampToValueAtTime(0.0001, stopTime)
  osc.stop(stopTime + 0.005)
}
// Simple stereo-ish reverb using feedback delay network (very light CPU)
const getReverb = () => {
  const ctx = ensureContext()
  if (!ctx || !masterGain) return null
  const input = ctx.createGain()
  const delay1 = ctx.createDelay()
  const delay2 = ctx.createDelay()
  const fb1 = ctx.createGain()
  const fb2 = ctx.createGain()
  const mix = ctx.createGain()
  // Settings for a soft tail ~600-800ms
  delay1.delayTime.value = 0.12
  delay2.delayTime.value = 0.23
  fb1.gain.value = 0.35
  fb2.gain.value = 0.28
  mix.gain.value = 0.25
  input.connect(delay1)
  delay1.connect(fb1)
  fb1.connect(delay1)
  input.connect(delay2)
  delay2.connect(fb2)
  fb2.connect(delay2)
  delay1.connect(mix)
  delay2.connect(mix)
  mix.connect(masterGain)
  return { input, mix }
}

const noteToFrequency = (note: string) => {
  // A4 = 440Hz
  const A4 = 440
  const notes = { C: -9, 'C#': -8, Db: -8, D: -7, 'D#': -6, Eb: -6, E: -5, F: -4, 'F#': -3, Gb: -3, G: -2, 'G#': -1, Ab: -1, A: 0, 'A#': 1, Bb: 1, B: 2 }
  const m = note.match(/^([A-G](?:#|b)?)(\d)$/)
  if (!m) return A4
  const [, n, octaveStr] = m
  const semitoneFromA = (notes as any)[n]
  const octave = parseInt(octaveStr, 10)
  const semitones = semitoneFromA + (octave - 4) * 12
  return A4 * Math.pow(2, semitones / 12)
}

export const playContemplate = () => {
  const ctx = ensureContext()
  if (!ctx || !masterGain || isMuted) return
  const chord = ['C4', 'Eb4', 'G4', 'Bb4']
  const { input } = getReverb() || {}
  const startOffset = 0.001
  chord.forEach((n, idx) => {
    const freq = noteToFrequency(n)
    // Slight stagger for bloom
    setTimeout(() => {
      // longer, gentle envelope
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = now() + 0.001
      const { t2, release } = scheduleEnvelope(gain, t0, { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.8, peak: 1.0 })
      gain.gain.setValueAtTime(gain.gain.value, t0)
      gain.gain.setValueAtTime(gain.gain.value * 0.22, t0)
      osc.connect(gain)
      if (input) {
        gain.connect(input)
      }
      gain.connect(masterGain)
      osc.start(t0)
      const stopTime = Math.max(t0 + 1.4, t2 + release)
      gain.gain.linearRampToValueAtTime(0.0001, stopTime)
      osc.stop(stopTime + 0.01)
    }, startOffset + idx * 60)
  })
}

const playBiTone = (
  f1: number,
  f2: number,
  gapMs = 60,
  type: OscillatorType = 'sine',
  volume = 0.15
) => {
  const ctx = ensureContext()
  if (!ctx) return
  playTone(f1, 0.12, type, volume)
  setTimeout(() => playTone(f2, 0.12, type, volume), gapMs)
}

export const playHover = () => {
  // Ultra subtle, warm smooth tick
  playTone(180, 0.05, 'sine', 0.05, { attack: 0.008, decay: 0.04, sustain: 0.1, release: 0.05 })
}

export const playClick = () => {
  // Soft UI tap
  playTone(240, 0.05, 'sine', 0.1, { attack: 0.004, decay: 0.03, sustain: 0.1, release: 0.04 })
}

export const playAction = () => {
  // Soft angelic chime (short, warm): E6 → B6 → E7
  const e6 = noteToFrequency('E6')
  const b6 = noteToFrequency('B6')
  const e7 = noteToFrequency('E7')
  // Gentle envelopes and low volume for a non-intrusive feel
  playTone(e6, 0.09, 'sine', 0.22, { attack: 0.003, decay: 0.06, sustain: 0.1, release: 0.12, peak: 0.9 })
  setTimeout(() => playTone(b6, 0.08, 'sine', 0.18, { attack: 0.002, decay: 0.05, sustain: 0.08, release: 0.1, peak: 0.85 }), 50)
  setTimeout(() => playTone(e7, 0.12, 'sine', 0.16, { attack: 0.002, decay: 0.05, sustain: 0.08, release: 0.12, peak: 0.8 }), 100)
}

export const playOpen = () => {
  // Pleasant up interval
  playBiTone(220, 330, 100, 'sine')
}

export const playClose = () => {
  // Pleasant down interval
  playBiTone(330, 220, 100, 'sine')
}

export const playSuccess = () => {
  // Short arpeggio
  playTone(392, 0.09, 'sine', 0.5)
  setTimeout(() => playTone(523.25, 0.09, 'sine', 0.5), 90)
  setTimeout(() => playTone(659.25, 0.12, 'sine', 0.5), 180)
}

export const playError = () => {
  // Soft error buzz (dissonant bi-tone)
  playTone(180, 0.16, 'sawtooth', 0.4, { attack: 0.002, decay: 0.06, sustain: 0.2, release: 0.08 })
  setTimeout(() => playTone(155, 0.14, 'sawtooth', 0.35), 20)
}

// Low-frequency thump for tab/button changes
export const playThump = () => {
  const ctx = ensureContext()
  if (!ctx || !masterGain || isMuted) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  const start = now() + 0.001
  // Start slightly higher, glide down quickly for a satisfying thump
  osc.frequency.setValueAtTime(180, start)
  osc.frequency.exponentialRampToValueAtTime(95, start + 0.08)
  // Envelope
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(0.8, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14)
  osc.connect(gain)
  gain.connect(masterGain)
  osc.start(start)
  osc.stop(start + 0.16)
}

export const setMasterVolume = (v: number) => {
  const ctx = ensureContext()
  if (!ctx || !masterGain) return
  masterGain.gain.value = Math.max(0, Math.min(1, v))
}

export const getMuted = () => isMuted
export const setMuted = (muted: boolean) => {
  isMuted = muted
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SOUND_MUTED_KEY, muted ? '1' : '0')
    } catch {}
  }
}
export const mute = () => { setMuted(true) }
export const unmute = () => { setMuted(false) }

export const warmupAudio = () => {
  // Call this on first user gesture if needed
  ensureContext()
}

export type SoundExports = {
  playHover: () => void
  playClick: () => void
  playAction: () => void
  playOpen: () => void
  playClose: () => void
  playSuccess: () => void
  playError: () => void
  playThump: () => void
  playContemplate: () => void
  setMasterVolume: (v: number) => void
  mute: () => void
  unmute: () => void
  warmupAudio: () => void
}


