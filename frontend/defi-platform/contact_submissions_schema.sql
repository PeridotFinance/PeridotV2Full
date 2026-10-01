-- Contact Form Submissions Database Schema
-- Run this SQL to create the required table for contact form submissions

CREATE TABLE IF NOT EXISTS contact_submissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'archived')),
    admin_notes TEXT,
    replied_at TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email ON contact_submissions(email);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON contact_submissions(status);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at ON contact_submissions(created_at DESC);

-- Create a trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_contact_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contact_submissions_updated_at_trigger
    BEFORE UPDATE ON contact_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_contact_submissions_updated_at();

-- Add comments for documentation
COMMENT ON TABLE contact_submissions IS 'Stores contact form submissions from the website';
COMMENT ON COLUMN contact_submissions.id IS 'Primary key, auto-incrementing';
COMMENT ON COLUMN contact_submissions.name IS 'Full name of the person submitting the form';
COMMENT ON COLUMN contact_submissions.email IS 'Email address of the submitter';
COMMENT ON COLUMN contact_submissions.subject IS 'Subject line of the inquiry';
COMMENT ON COLUMN contact_submissions.message IS 'Full message content';
COMMENT ON COLUMN contact_submissions.ip_address IS 'IP address of the submitter for spam prevention';
COMMENT ON COLUMN contact_submissions.user_agent IS 'Browser user agent for analytics';
COMMENT ON COLUMN contact_submissions.status IS 'Current status: new, read, replied, or archived';
COMMENT ON COLUMN contact_submissions.admin_notes IS 'Internal notes for admin team';
COMMENT ON COLUMN contact_submissions.replied_at IS 'Timestamp when reply was sent';
COMMENT ON COLUMN contact_submissions.created_at IS 'When the submission was created';
COMMENT ON COLUMN contact_submissions.updated_at IS 'When the submission was last updated'; 