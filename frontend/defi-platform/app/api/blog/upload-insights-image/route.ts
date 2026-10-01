import { NextRequest, NextResponse } from "next/server"
import { uploadBufferToFirebase } from "@/lib/firebase-storage"
import { assertProtectedBlogWrite } from "../_lib/security"

const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
])

function sanitizeSlug(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "article"
  )
}

function sanitizeToken(value: string, fallback: string) {
  const cleaned = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return cleaned || fallback
}

export async function POST(request: NextRequest) {
  const denied = assertProtectedBlogWrite(request)
  if (denied) return denied

  try {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided. Please choose an image first." }, { status: 400 })
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error:
            "Unsupported image type. Please upload JPG, PNG, WEBP, GIF, or AVIF.",
        },
        { status: 400 }
      )
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "The selected file is empty." }, { status: 400 })
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Maximum allowed size is 8 MB." },
        { status: 400 }
      )
    }

    const slug = sanitizeSlug((formData.get("slug") as string | null) ?? "article")
    const sectionId = sanitizeToken((formData.get("sectionId") as string | null) ?? "section", "section")

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const extensionByType: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/avif": "avif",
    }
    const extension = extensionByType[file.type] || "png"
    const destinationPath = `blog/${slug}/section-images/${sectionId}-${Date.now()}.${extension}`
    const contentType = file.type || "application/octet-stream"

    const url = await uploadBufferToFirebase(buffer, destinationPath, contentType)
    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error("Error uploading insights image:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
