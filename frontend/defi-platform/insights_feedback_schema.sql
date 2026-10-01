-- Insights feedback persistence table
CREATE TABLE IF NOT EXISTS insights_article_feedback (
  id BIGSERIAL PRIMARY KEY,
  article_id TEXT NOT NULL,
  article_slug TEXT,
  reaction TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_insights_feedback_article_session
  ON insights_article_feedback (article_id, session_id);

CREATE INDEX IF NOT EXISTS idx_insights_feedback_article_id
  ON insights_article_feedback (article_id);

CREATE INDEX IF NOT EXISTS idx_insights_feedback_reaction
  ON insights_article_feedback (reaction);

