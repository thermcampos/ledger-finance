-- Daily budget digest opt-ins (docs/daily-digest.md, change 2): a per-budget
-- "include in the daily email" flag and a per-user master switch. Both default
-- off, so existing users receive nothing until they opt in.
ALTER TABLE budgets ADD COLUMN daily_email_summary BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users   ADD COLUMN email_summaries_enabled BOOLEAN NOT NULL DEFAULT FALSE;
