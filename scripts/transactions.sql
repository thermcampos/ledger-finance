-- Transactions for a given category.
-- Replace the category id below, then run:
--   kubectl exec -i ledger-finance-db-866fc6dfb9-24gsv -- psql -U fin-expert -d lfdata < script.sql

SELECT
    t.occurred_on AS date,
    a.name        AS account,
    t.amount      AS value,
    t.*,
    a.*
FROM transactions t
JOIN accounts a ON a.id = t.account_id
WHERE t.category_id = 19  -- <-- put the category ID here
ORDER BY t.occurred_on, t.id;
