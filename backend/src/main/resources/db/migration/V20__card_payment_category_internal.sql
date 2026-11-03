-- "Card payment" categories created by users before bill payments existed were reused by
-- CreditCardBillPaymentResource without being flagged internal, so bill payments counted as
-- spending (Report, Budgets, digest). Flag them like the ones the app creates itself.
UPDATE categories SET internal = TRUE WHERE name = 'Card payment' AND internal = FALSE;
