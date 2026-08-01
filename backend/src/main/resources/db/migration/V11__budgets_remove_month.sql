-- Remove per-month scoping from budgets so a category has a single
-- persistent monthly limit. Keep the latest row per (user, category)
-- and drop the month column.

-- Preserve only the most recent budget for each (user, category).
DELETE FROM budgets
WHERE id NOT IN (
    SELECT MAX(id)
    FROM budgets
    GROUP BY user_id, category_id
);

-- Now each (user, category) is unique, so the month column can go.
ALTER TABLE budgets DROP COLUMN month;

-- The remaining unique constraint is (user_id, category_id) via the PK,
-- which is sufficient. Remove the old (category_id, month) constraint
-- if it exists (name may vary by dialect; use the generic form below).
ALTER TABLE budgets
    ADD CONSTRAINT budgets_user_category_unique UNIQUE (user_id, category_id);
