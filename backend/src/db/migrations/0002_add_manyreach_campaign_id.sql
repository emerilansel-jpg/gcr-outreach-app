-- Adds the ManyReach campaign id column that the send flow stores per GCR
-- campaign. Added as a separate migration (not folded into 0001) because 0001
-- was already applied to the production D1 instance, so re-running it would not
-- pick up the new column. A fresh database still gets the column via 0001+0002.
ALTER TABLE campaigns ADD COLUMN manyreach_campaign_id INTEGER;
