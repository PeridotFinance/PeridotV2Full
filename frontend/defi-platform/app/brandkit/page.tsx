"use client"

import { useState } from "react"
import Image from "next/image"
import { Download, Copy, Check, ArrowLeft } from "lucide-react"
import Link from "next/link"

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssetCardProps {
  label: string
  src: string
  bg: "dark" | "light" | "mid"
  downloads: { label: string; href: string; filename: string }[]
}

interface ColorSwatchProps {
  name: string
  hex: string
  hsl?: string
  role: string
  textDark?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function AssetCard({ label, src, bg, downloads }: AssetCardProps) {
  const bgClass =
    bg === "dark"
      ? "bg-[#0A0B0F]"
      : bg === "light"
      ? "bg-[#F4F5F7]"
      : "bg-[#13161F]"

  return (
    <div className="rounded-xl border border-white/8 overflow-hidden flex flex-col">
      <div className={`${bgClass} flex items-center justify-center p-8 h-40`}>
        <Image
          src={src}
          alt={label}
          width={180}
          height={80}
          className="object-contain max-h-20 w-auto"
          unoptimized
        />
      </div>
      <div className="bg-[#13161F] border-t border-white/8 px-4 py-3 flex flex-col gap-2">
        <p className="text-sm font-medium text-white/80">{label}</p>
        <div className="flex flex-wrap gap-2">
          {downloads.map((d) => (
            <a
              key={d.label}
              href={d.href}
              download={d.filename}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-primary/10 border border-white/10 hover:border-primary/40 text-white/70 hover:text-primary transition-all"
            >
              <Download className="w-3 h-3" />
              {d.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

function ColorSwatch({ name, hex, hsl, role, textDark }: ColorSwatchProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(hex)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="rounded-xl overflow-hidden border border-white/8 flex flex-col">
      <div
        className="h-24 w-full relative cursor-pointer group"
        style={{ backgroundColor: hex }}
        onClick={handleCopy}
      >
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-t-xl">
          {copied ? (
            <Check className={`w-5 h-5 ${textDark ? "text-black/70" : "text-white"}`} />
          ) : (
            <Copy className={`w-5 h-5 ${textDark ? "text-black/70" : "text-white"}`} />
          )}
        </div>
      </div>
      <div className="bg-[#13161F] px-4 py-3 flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-white/50 font-mono">{hex}</p>
        {hsl && <p className="text-xs text-white/35 font-mono">{hsl}</p>}
        <p className="text-xs text-white/40 mt-1">{role}</p>
      </div>
    </div>
  )
}

// ─── Data ────────────────────────────────────────────────────────────────────

const LOGOS: AssetCardProps[] = [
  {
    label: "Logo — Green / White Typeface",
    src: "/Peridot-Logo-Green-White-Typeface.svg",
    bg: "dark",
    downloads: [
      { label: "SVG", href: "/Peridot-Logo-Green-White-Typeface.svg", filename: "Peridot-Logo-Green-White-Typeface.svg" },
    ],
  },
  {
    label: "Logo — Green / Black Typeface",
    src: "/Peridot-Logo-Green-Black-Typeface.svg",
    bg: "light",
    downloads: [
      { label: "SVG", href: "/Peridot-Logo-Green-Black-Typeface.svg", filename: "Peridot-Logo-Green-Black-Typeface.svg" },
    ],
  },
  {
    label: "Logo — Ash White",
    src: "/Peridot Logo - Ash White.svg",
    bg: "dark",
    downloads: [
      { label: "SVG", href: "/Peridot%20Logo%20-%20Ash%20White.svg", filename: "Peridot-Logo-Ash-White.svg" },
    ],
  },
  {
    label: "Logo — Dark Slate",
    src: "/Peridot Logo - Dark Slate.svg",
    bg: "light",
    downloads: [
      { label: "SVG", href: "/Peridot%20Logo%20-%20Dark%20Slate.svg", filename: "Peridot-Logo-Dark-Slate.svg" },
    ],
  },
]

const ICONS: AssetCardProps[] = [
  {
    label: "Icon — Mint Green",
    src: "/Peridot-Icon-Only-Mint-Green.svg",
    bg: "dark",
    downloads: [
      { label: "SVG", href: "/Peridot-Icon-Only-Mint-Green.svg", filename: "Peridot-Icon-Mint-Green.svg" },
    ],
  },
  {
    label: "Icon — Ash White",
    src: "/Peridot-Icon-Only-Ash-White.svg",
    bg: "dark",
    downloads: [
      { label: "SVG", href: "/Peridot-Icon-Only-Ash-White.svg", filename: "Peridot-Icon-Ash-White.svg" },
    ],
  },
  {
    label: "Icon — Dark Slate",
    src: "/Peridot-Icon-Only-Dark-Slate.svg",
    bg: "light",
    downloads: [
      { label: "SVG", href: "/Peridot-Icon-Only-Dark-Slate.svg", filename: "Peridot-Icon-Dark-Slate.svg" },
    ],
  },
]

const MASCOTS: AssetCardProps[] = [
  {
    label: "Owl Mascot — Mint Green",
    src: "/Owl Mascot - Mint Green.svg",
    bg: "mid",
    downloads: [
      { label: "SVG", href: "/Owl%20Mascot%20-%20Mint%20Green.svg", filename: "Peridot-Owl-Mint-Green.svg" },
    ],
  },
  {
    label: "Owl Mascot — Colored",
    src: "/Owl Mascot - Colored.svg",
    bg: "mid",
    downloads: [
      { label: "SVG", href: "/Owl%20Mascot%20-%20Colored.svg", filename: "Peridot-Owl-Colored.svg" },
    ],
  },
  {
    label: "Owl Mascot — Bitcoin / Mint",
    src: "/Owl Mascot - Bitcoin - Mint Green.svg",
    bg: "mid",
    downloads: [
      { label: "SVG", href: "/Owl%20Mascot%20-%20Bitcoin%20-%20Mint%20Green.svg", filename: "Peridot-Owl-Bitcoin-Mint-Green.svg" },
    ],
  },
  {
    label: "Owl Mascot — Bitcoin / Colored",
    src: "/Owl Mascot - Bitcoin - Colored.svg",
    bg: "mid",
    downloads: [
      { label: "SVG", href: "/Owl%20Mascot%20-%20Bitcoin%20-%20Colored.svg", filename: "Peridot-Owl-Bitcoin-Colored.svg" },
    ],
  },
]

const COLORS: ColorSwatchProps[] = [
  { name: "Mint Green", hex: "#3DD68C", hsl: "hsl(150 59% 48%)", role: "Primary brand color" },
  { name: "Cyan", hex: "#00F0FF", hsl: "hsl(184 100% 50%)", role: "Accent primary · UI highlights" },
  { name: "Purple", hex: "#7B2CBF", hsl: "hsl(276 61% 45%)", role: "Accent secondary · gradients" },
  { name: "Dark BG", hex: "#0A0B0F", role: "App background" },
  { name: "Card Surface", hex: "#13161F", role: "Card / panel background" },
  { name: "Off-White", hex: "#F4F5F7", role: "Light mode backgrounds", textDark: true },
  { name: "Text Primary", hex: "#FFFFFF", role: "Primary text (dark mode)" },
  { name: "Text Secondary", hex: "#9CA3AF", role: "Secondary / muted text" },
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BrandKitPage() {
  return (
    <div className="min-h-screen bg-[#0A0B0F] text-white">

      {/* Back nav */}
      <div className="border-b border-white/8 bg-[#0A0B0F]/95 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto max-w-6xl px-4 h-14 flex items-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-16 space-y-20">

        {/* ── Hero ── */}
        <div className="space-y-4 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium tracking-wide uppercase">
            Brand Kit
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Peridot Brand Assets
          </h1>
          <p className="text-lg text-white/60 leading-relaxed">
            Official logos, icons, mascots, color palette and typography for Peridot Finance.
            Use these assets when writing about, referencing, or partnering with Peridot.
          </p>
          <p className="text-sm text-white/40">
            By downloading these assets you agree to our{" "}
            <Link href="/terms" className="text-primary/80 hover:text-primary underline underline-offset-2 transition-colors">
              Terms & Conditions
            </Link>
            . Do not alter the logo colors, proportions, or typeface.
          </p>
        </div>

        {/* ── Logos ── */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold">Logo Suite</h2>
            <p className="text-sm text-white/50">
              Available in SVG (vector, preferred) and PNG. Use the variant that best contrasts with your background.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {LOGOS.map((a) => (
              <AssetCard key={a.label} {...a} />
            ))}
          </div>
        </section>

        {/* ── Icons ── */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold">Icon Suite</h2>
            <p className="text-sm text-white/50">
              Icon-only mark for favicons, avatars, and small-scale placements.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {ICONS.map((a) => (
              <AssetCard key={a.label} {...a} />
            ))}
          </div>
        </section>

        {/* ── Mascots ── */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold">Mascot — The Owl</h2>
            <p className="text-sm text-white/50">
              Peridot's owl mascot. Use for editorial, social, and community content.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MASCOTS.map((a) => (
              <AssetCard key={a.label} {...a} />
            ))}
          </div>
        </section>

        {/* ── Color Palette ── */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold">Color Palette</h2>
            <p className="text-sm text-white/50">
              Click any swatch to copy the hex value to clipboard.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {COLORS.map((c) => (
              <ColorSwatch key={c.name} {...c} />
            ))}
          </div>
        </section>

        {/* ── Typography ── */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold">Typography</h2>
            <p className="text-sm text-white/50">
              Three typefaces form the Peridot type system — each with a distinct role.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Poppins */}
            <div className="rounded-xl border border-white/8 bg-[#13161F] p-6 space-y-4">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest mb-1 font-mono">Body / Headings</p>
                <p className="text-2xl font-bold font-poppins">Poppins</p>
              </div>
              <div className="space-y-1 font-poppins">
                <p className="text-xl font-bold text-white">Bold 700</p>
                <p className="text-xl font-semibold text-white/90">SemiBold 600</p>
                <p className="text-xl font-medium text-white/80">Medium 500</p>
                <p className="text-xl font-normal text-white/70">Regular 400</p>
              </div>
              <p className="text-xs text-white/40">Primary typeface · all body copy and UI text</p>
            </div>

            {/* Inter */}
            <div className="rounded-xl border border-white/8 bg-[#13161F] p-6 space-y-4">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest mb-1 font-mono">UI / Cyber-Elegant</p>
                <p className="text-2xl font-bold font-inter">Inter</p>
              </div>
              <div className="space-y-1 font-inter">
                <p className="text-xl font-bold text-white">Bold 700</p>
                <p className="text-xl font-medium text-white/80">Medium 500</p>
                <p className="text-xl font-normal text-white/70">Regular 400</p>
              </div>
              <p className="text-xs text-white/40">Interface labels · navigation · data tables</p>
            </div>

            {/* JetBrains Mono */}
            <div className="rounded-xl border border-white/8 bg-[#13161F] p-6 space-y-4">
              <div>
                <p className="text-xs text-white/40 uppercase tracking-widest mb-1 font-mono">Code / Data</p>
                <p className="text-2xl font-bold font-mono">JetBrains Mono</p>
              </div>
              <div className="space-y-1 font-mono">
                <p className="text-xl font-bold text-[#3DD68C]">Bold 700</p>
                <p className="text-xl font-medium text-[#00F0FF]">Medium 500</p>
                <p className="text-xl font-normal text-white/70">Regular 400</p>
              </div>
              <p className="text-xs text-white/40">Wallet addresses · numbers · on-chain data</p>
            </div>

          </div>
        </section>

        {/* ── Guidelines ── */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold">Usage Guidelines</h2>
            <p className="text-sm text-white/50">
              Keep the brand consistent. A few simple rules to follow.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Do */}
            <div className="rounded-xl border border-[#3DD68C]/20 bg-[#3DD68C]/5 p-6 space-y-4">
              <p className="text-sm font-semibold text-[#3DD68C] uppercase tracking-widest">Do</p>
              <ul className="space-y-3 text-sm text-white/70">
                {[
                  "Use the provided SVG or PNG files as-is.",
                  "Maintain clear space of at least the icon's height on all sides.",
                  "Use the Mint Green logo on dark backgrounds.",
                  "Use the Dark Slate logo on light backgrounds.",
                  "Refer to the product as \"Peridot\" or \"Peridot Finance\".",
                  "Use the owl mascot for community and editorial content.",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="text-[#3DD68C] mt-0.5">✓</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Don't */}
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 space-y-4">
              <p className="text-sm font-semibold text-red-400 uppercase tracking-widest">Don't</p>
              <ul className="space-y-3 text-sm text-white/70">
                {[
                  "Don't alter logo colors, proportions, or typeface.",
                  "Don't place the logo on low-contrast backgrounds.",
                  "Don't rotate, skew, or add effects to the logo.",
                  "Don't use the logo in a way that implies endorsement without agreement.",
                  "Don't use \"Peridot\" as part of your product or company name.",
                  "Don't compress or stretch the mascot illustrations.",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="text-red-400 mt-0.5">✕</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </section>

        {/* ── Contact ── */}
        <section className="rounded-xl border border-white/8 bg-[#13161F] p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="font-semibold text-white">Need something specific?</p>
            <p className="text-sm text-white/50">
              If you need additional formats, high-resolution files, or have a partnership inquiry, reach out.
            </p>
          </div>
          <Link
            href="/contact"
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 hover:border-primary/60 text-primary font-medium text-sm transition-all"
          >
            Contact Us
          </Link>
        </section>

      </div>
    </div>
  )
}
