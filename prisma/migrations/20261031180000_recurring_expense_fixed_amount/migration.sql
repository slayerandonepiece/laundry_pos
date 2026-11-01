-- Additive: existing recurring bills stay fixed-amount.
ALTER TABLE "recurring_expense_series" ADD COLUMN "fixedAmount" BOOLEAN NOT NULL DEFAULT true;
