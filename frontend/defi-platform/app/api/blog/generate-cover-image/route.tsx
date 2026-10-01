import { NextRequest, NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'

// POST /api/blog/generate-cover-image - generate and upload cover image
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, slug } = body

    if (!title || !slug) {
      return NextResponse.json(
        { error: 'Missing required fields: title, slug' },
        { status: 400 }
      )
    }

    // Generate image using Next.js ImageResponse
    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', // Green gradient
            padding: '80px',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              maxWidth: '1000px',
            }}
          >
            <h1
              style={{
                fontSize: '72px',
                fontWeight: 900,
                color: '#ffffff',
                lineHeight: 1.2,
                margin: 0,
                textAlign: 'center',
                wordWrap: 'break-word',
              }}
            >
              {title}
            </h1>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    )

    // Convert ImageResponse to buffer
    const arrayBuffer = await imageResponse.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // For now, return the image as base64 or save to public folder
    // In production, upload to Firebase Storage
    const base64Image = buffer.toString('base64')
    const dataUrl = `data:image/png;base64,${base64Image}`

    // TODO: Upload to Firebase Storage and return public URL
    // For now, we'll save to public folder or use a placeholder
    // The actual upload will be handled in the create article endpoint

    return NextResponse.json({
      success: true,
      imageDataUrl: dataUrl,
      message: 'Image generated successfully. Upload to storage will be handled in article creation.'
    })
  } catch (error) {
    console.error('Error generating cover image:', error)
    return NextResponse.json(
      { error: 'Failed to generate cover image', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

