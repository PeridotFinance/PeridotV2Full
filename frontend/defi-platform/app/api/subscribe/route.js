import postgres from 'postgres'

// Database connection
const sql = postgres({
  host: '127.0.0.1',
  port: 5432,
  database: 'nextjs_app',
  username: 'nextjs_user',
  password: 'ylW1JpChPB0+2RWY1kxaNaFG5TmJvLxi6xho6kFqU8M=',
})

export async function POST(request) {
  try {
    const { email } = await request.json()
    
    // Basic validation
    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Please provide a valid email address' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Insert the email into the database
    await sql`
      INSERT INTO email_subscribers (email)
      VALUES (${email})
      ON CONFLICT (email) DO NOTHING
    `

    return new Response(
      JSON.stringify({ success: true, message: 'Subscription successful!' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Subscription error:', error)
    
    return new Response(
      JSON.stringify({ error: 'Failed to subscribe. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
} 