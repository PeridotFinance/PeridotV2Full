import { NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { isAdminRequest } from '@/lib/admin-auth';

// GET - Fetch all contact submissions
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const submissions = await sql`
      SELECT 
        id,
        name,
        email,
        subject,
        message,
        status,
        admin_notes,
        replied_at,
        created_at,
        updated_at
      FROM contact_submissions
      ORDER BY created_at DESC
    `;

    return NextResponse.json(
      { 
        success: true, 
        submissions: submissions.map(submission => ({
          ...submission,
          created_at: submission.created_at.toISOString(),
          updated_at: submission.updated_at.toISOString(),
          replied_at: submission.replied_at?.toISOString() || null
        }))
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching contact submissions:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch contact submissions',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// PATCH - Update contact submission status and notes
export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id, status, admin_notes } = await request.json();

    // Validate required fields
    if (!id || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: id and status' },
        { status: 400 }
      );
    }

    // Validate status value
    const validStatuses = ['new', 'read', 'replied', 'archived'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 400 }
      );
    }

    // Update the submission
    const updateData: any = {
      status,
      updated_at: new Date()
    };

    // Add admin_notes if provided
    if (admin_notes !== undefined) {
      updateData.admin_notes = admin_notes;
    }

    // Set replied_at timestamp if status is 'replied'
    if (status === 'replied') {
      updateData.replied_at = new Date();
    }

    const result = await sql`
      UPDATE contact_submissions 
      SET 
        status = ${status},
        admin_notes = ${admin_notes || null},
        replied_at = ${status === 'replied' ? new Date() : null},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, status, admin_notes, replied_at, updated_at
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Contact submission not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { 
        success: true, 
        message: 'Contact submission updated successfully',
        submission: {
          ...result[0],
          updated_at: result[0].updated_at.toISOString(),
          replied_at: result[0].replied_at?.toISOString() || null
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating contact submission:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update contact submission',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
} 