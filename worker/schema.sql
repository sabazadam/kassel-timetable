-- Feedback reports from the site (D1 database ders-feedback). Apply with:
-- npx wrangler d1 execute ders-feedback --remote --file worker/schema.sql
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  program TEXT NOT NULL,
  course_id TEXT,
  course_title TEXT,
  module_title TEXT,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  contact TEXT,
  lang TEXT,
  context TEXT,
  data_version TEXT,
  -- Salted SHA-256 of the sender's IP: counts reports per sender for the daily cap, never the IP itself.
  ip_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS feedback_ip_time ON feedback (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS feedback_time ON feedback (created_at);
