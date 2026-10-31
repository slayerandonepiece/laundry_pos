-- A payment method's stage now lives only on the platform catalogue
-- (platform_payment_methods."defaultStage"), read live for every organization.
-- Organizations store only whether a method is enabled, so the per-organization
-- copy is dropped. Every enabled flag is left untouched.
ALTER TABLE "organization_payment_methods" DROP COLUMN "stage";
