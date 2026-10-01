import { sql } from '@/lib/database'

export async function POST(request) {
  try {
    const { name, email, expectedUsage } = await request.json()
    
    // DoS Protection: Validate field lengths
    if (name?.length > 128 || email?.length > 128 || expectedUsage?.length > 1000) {
      return new Response(
        JSON.stringify({ error: 'Input too long' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Basic validation
    if (!name || !email || !email.includes('@') || !expectedUsage) {
      return new Response(
        JSON.stringify({ error: 'Please fill in all required fields with valid data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Rate Limiting: Tightened window to reduce automated spam (per-email, 10 minutes)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ipAddress = forwardedFor?.split(',')[0] || realIp || '127.0.0.1';

    const recentSubmission = await sql`
      SELECT id FROM waitlist_members 
      WHERE email = ${email.toLowerCase().trim()} 
      AND created_at > NOW() - INTERVAL '10 minutes'
      LIMIT 1
    `;

    if (recentSubmission.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait a minute before trying again.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
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