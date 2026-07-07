-- Ledger — demo seed data
--
-- Run this against a fresh dev database, after the schema has been created
-- (start the backend once with `./mvnw quarkus:dev`, then stop it, or run
-- this while it's running — dev mode uses drop-and-create so re-running
-- the app will wipe this data again).
--
--   psql -h localhost -U ledger -d ledger -f seed-data.sql
--
-- Demo login:
--   email:    demo@ledger.app
--   password: demo12345
--
-- IDs are auto-assigned (IDENTITY columns) — this script never hardcodes
-- one, so it's safe to run against a database the app is also writing to.

BEGIN;

-- --- User -------------------------------------------------------------
-- Password hash below is bcrypt("demo12345"), cost 10 — matches BcryptUtil
-- in AuthResource.java. Log in with this or sign up your own account instead.
INSERT INTO users (email, password_hash, display_name)
VALUES ('demo@ledger.app', '$2b$10$EODF1RiTyo7YHBch0gun/.la6kFiHQmAcmbWwckg9YCY8Q06Redge', 'Jordan M.');

-- --- Categories ---------------------------------------------------------
INSERT INTO categories (user_id, name, color_hex)
SELECT id, c.name, c.color_hex
FROM users, (VALUES
    ('Housing',        '#C9A227'),
    ('Groceries',      '#4FA98A'),
    ('Transport',      '#6B8FC9'),
    ('Dining',         '#C9A227'),
    ('Subscriptions',  '#8B92A0'),
    ('Salary',         '#4FA98A'),
    ('Transfer',       '#8B92A0')
) AS c(name, color_hex)
WHERE users.email = 'demo@ledger.app';

-- --- Accounts -------------------------------------------------------
-- opening_balance is the immutable anchor `balance` is derived from once
-- transactions below are applied in chronological order — see
-- TransactionResource#recomputeAccountBalance. Values below were back-solved
-- from each account's final balance minus its seeded transactions' sum, so
-- they land on the same balance/running_balance figures already seeded.
INSERT INTO accounts (user_id, name, institution, kind, balance, opening_balance, last_synced_at)
SELECT id, a.name, a.institution, a.kind, a.balance, a.opening_balance, now()
FROM users, (VALUES
    ('Everyday',        'First National',  'CHECKING',    6412.08,   4326.78),
    ('Emergency fund',  'First National',  'SAVINGS',    28900.44,  27900.44),
    ('Visa Signature',  'Chase',           'CREDIT_CARD', -1284.30, -1223.46),
    ('Brokerage',       'Fidelity',        'INVESTMENT', 14203.68,  14203.68)
) AS a(name, institution, kind, balance, opening_balance)
WHERE users.email = 'demo@ledger.app';

-- --- Transactions -------------------------------------------------------
-- Checking account
INSERT INTO transactions (account_id, category_id, description, amount, occurred_on, running_balance)
SELECT a.id, cat.id, t.description, t.amount, t.occurred_on::date, t.running_balance
FROM accounts a
JOIN users u ON u.id = a.user_id AND u.email = 'demo@ledger.app'
CROSS JOIN LATERAL (VALUES
    ('Whole Foods Market',      -86.42,  '2026-07-04', 6412.08, 'Groceries'),
    ('Payroll — Acme Inc.',    3800.00,  '2026-07-03', 6498.50, 'Salary'),
    ('Rent — July',          -2100.00,  '2026-07-02', 2698.50, 'Housing'),
    ('Trader Joe''s',           -54.28, '2026-06-27', 4798.50, 'Groceries'),
    ('Union Pacific Rail',     -124.00, '2026-06-24', 4852.78, 'Transport'),
    ('Freelance payment',       650.00, '2026-06-22', 4976.78, 'Salary')
) AS t(description, amount, occurred_on, running_balance, category_name)
JOIN categories cat ON cat.user_id = u.id AND cat.name = t.category_name
WHERE a.name = 'Everyday';

-- Savings account
INSERT INTO transactions (account_id, category_id, description, amount, occurred_on, running_balance)
SELECT a.id, cat.id, t.description, t.amount, t.occurred_on::date, t.running_balance
FROM accounts a
JOIN users u ON u.id = a.user_id AND u.email = 'demo@ledger.app'
CROSS JOIN LATERAL (VALUES
    ('Transfer from Checking', 1000.00, '2026-06-29', 28900.44, 'Transfer')
) AS t(description, amount, occurred_on, running_balance, category_name)
JOIN categories cat ON cat.user_id = u.id AND cat.name = t.category_name
WHERE a.name = 'Emergency fund';

-- Credit card
INSERT INTO transactions (account_id, category_id, description, amount, occurred_on, running_balance)
SELECT a.id, cat.id, t.description, t.amount, t.occurred_on::date, t.running_balance
FROM accounts a
JOIN users u ON u.id = a.user_id AND u.email = 'demo@ledger.app'
CROSS JOIN LATERAL (VALUES
    ('Spotify',              -11.99, '2026-07-01', -1284.30, 'Subscriptions'),
    ('Shell Gas Station',    -42.10, '2026-06-29', -1272.31, 'Transport'),
    ('Blue Bottle Coffee',    -6.75, '2026-06-26', -1230.21, 'Dining')
) AS t(description, amount, occurred_on, running_balance, category_name)
JOIN categories cat ON cat.user_id = u.id AND cat.name = t.category_name
WHERE a.name = 'Visa Signature';

-- --- Budgets (July 2026) -------------------------------------------------
INSERT INTO budgets (user_id, category_id, month, limit_amount)
SELECT u.id, cat.id, '2026-07-01'::date, b.limit_amount
FROM users u
JOIN categories cat ON cat.user_id = u.id
CROSS JOIN LATERAL (VALUES
    ('Housing',        2100.00),
    ('Groceries',       500.00),
    ('Transport',       250.00),
    ('Dining',          150.00),
    ('Subscriptions',    60.00)
) AS b(category_name, limit_amount)
WHERE u.email = 'demo@ledger.app' AND cat.name = b.category_name;

COMMIT;
