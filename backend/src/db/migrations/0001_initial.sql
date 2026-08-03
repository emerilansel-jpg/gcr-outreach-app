-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  mission_context TEXT NOT NULL,
  tone TEXT DEFAULT 'professional',
  target_audience TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL,
  website TEXT,
  social_url TEXT,
  email TEXT,
  email_verified INTEGER DEFAULT 0,
  company TEXT,
  title TEXT,
  status TEXT DEFAULT 'new',
  kanban_stage TEXT DEFAULT 'todo',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  channel TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  sent_at TEXT,
  opened_at TEXT,
  replied_at TEXT,
  manyreach_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Email Enrichments
CREATE TABLE IF NOT EXISTS email_enrichments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  email TEXT NOT NULL,
  confidence INTEGER,
  sources TEXT,
  verified_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_kanban ON contacts(kanban_stage);
CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_campaign ON messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_enrichments_contact ON email_enrichments(contact_id);
