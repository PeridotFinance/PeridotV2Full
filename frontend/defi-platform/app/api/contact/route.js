import { NextResponse } from 'next/server';
import { sql } from '@/lib/database';

export async function POST(request) {
  try {
    const { name, email, subject, message } = await request.json();

    // DoS Protection: Validate field lengths
    if (name?.length > 128 || email?.length > 128 || subject?.length > 256 || message?.length > 5000) {
      return NextResponse.json(
        { error: 'Input too long' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Basic email validation
    if (!email.includes('@') || email.length < 5) {
      return NextResponse.json(
        { error: 'Please provide a valid email address' },
        { status: 400 }
      );
    }

    // Get client information for spam prevention
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ipAddress = forwardedFor?.split(',')[0] || realIp || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || null;

    // Rate Limiting: Tightened short window from 1 minute to 10 minutes
    const recentSubmission = await sql`
      SELECT id FROM contact_submissions 
      WHERE (ip_address = ${ipAddress} OR email = ${email.toLowerCase().trim()}) 
      AND created_at > NOW() - INTERVAL '10 minutes'
      LIMIT 1
    `;

    if (recentSubmission.length > 0) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a few minutes before trying again.' },
        { status: 429 }
      );
    }

    // Additional rolling limit: max 5 messages per hour per IP/email
    const hourlyCountResult = await sql`
      SELECT COUNT(*)::int AS count
      FROM contact_submissions
      WHERE (ip_address = ${ipAddress} OR email = ${email.toLowerCase().trim()})
      AND created_at > NOW() - INTERVAL '1 hour'
    `;

    if (hourlyCountResult[0]?.count >= 5) {
      return NextResponse.json(
        { error: 'Too many messages in a short period. Please try again later.' },
        { status: 429 }
      );
    }

    // Insert the contact submission into the database
    const result = await sql`
      INSERT INTO contact_submissions (
        name,
        email,
        subject,
        message,
        ip_address,
        user_agent,
        status,
        created_at
      )
      VALUES (
        ${name.trim()},
        ${email.toLowerCase().trim()},
        ${subject.trim()},
        ${message.trim()},
        ${ipAddress},
        ${userAgent},
        'new',
        NOW()
      )
      RETURNING id, created_at
    `;

    console.log('Contact form submission saved:', {
      id: result[0].id,
      email: email.toLowerCase().trim(),
      subject: subject.trim(),
      created_at: result[0].created_at
    });

    return NextResponse.json(
      { 
        success: true, 
        message: 'Your message has been received successfully! We will get back to you soon.',
        submissionId: result[0].id
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error saving contact submission:', error);
    
    // Check if it's a duplicate email within a short time (implement basic rate limiting)
    if (error.message && error.message.includes('duplicate')) {
      return NextResponse.json(
        { error: 'You have already submitted a message recently. Please wait before submitting again.' },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to submit your message. Please try again later.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
} 