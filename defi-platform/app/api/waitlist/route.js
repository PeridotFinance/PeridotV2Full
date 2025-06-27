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
    const { name, email, expectedUsage } = await request.json()
    
    // Basic validation
    if (!name || !email || !email.includes('@') || !expectedUsage) {
      return new Response(
        JSON.stringify({ error: 'Please fill in all required fields with valid data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Split name into first and last name for existing table structure
    const nameParts = name.trim().split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    // Insert the waitlist entry into the database
    await sql`
      INSERT INTO waitlist_members (
        first_name, 
        last_name,
        email, 
        role,
        company,
        expected_usage,
        created_at
      )
      VALUES (
        ${firstName}, 
        ${lastName},
        ${email}, 
        ${'other'},
        ${null},
        ${expectedUsage},
        NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        expected_usage = EXCLUDED.expected_usage,
        updated_at = NOW()
    `

    return new Response(
      JSON.stringify({ success: true, message: 'Successfully joined the waitlist!' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Waitlist error:', error)
    
    return new Response(
      JSON.stringify({ error: 'Failed to join waitlist. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
} 