-- Migration 0003: Outscraper lead-scraping + Reoon verification support.
-- Adds:
--   * `source` + Outscraper enrichment columns on `contacts`
--   * `outscraper_jobs` table for async scraping job tickets
-- Applied on top of 0001 + 0002 (production D1 already has those).

ALTER TABLE contacts ADD COLUMN source TEXT DEFAULT 'manual';
ALTER TABLE contacts ADD COLUMN phone TEXT;
ALTER TABLE contacts ADD COLUMN address TEXT;
ALTER TABLE contacts ADD COLUMN rating TEXT;
ALTER TABLE contacts ADD COLUMN reviews TEXT;
ALTER TABLE contacts ADD COLUMN place_id TEXT;

CREATE TABLE IF NOT EXISTS outscraper_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  outscraper_job_id TEXT NOT NULL,
  query TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  result_limit INTEGER DEFAULT 20,
  found INTEGER DEFAULT 0,
  results TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
