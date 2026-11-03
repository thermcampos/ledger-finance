-- Daily budget digest (docs/daily-digest.md, change 5): the São Paulo date of the
-- last digest Resend accepted for this user. The scheduled run skips users already
-- sent today, so a retried or double-fired CronJob never emails twice.
ALTER TABLE users ADD COLUMN last_digest_sent_on DATE;
