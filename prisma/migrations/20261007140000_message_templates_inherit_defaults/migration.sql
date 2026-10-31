-- Organizations now inherit the platform message templates and keep a row only
-- for wording that differs. Onboarding used to copy every default into every
-- organization, so those copies never followed later platform edits. Remove only
-- the rows identical to the current platform default (body, enabled, attachment);
-- they carry no information the default does not. Differing rows stay as overrides.
DELETE FROM "organization_message_templates" o
USING "platform_message_templates" p
WHERE o."statusKey" = p."statusKey"
  AND o."body" = p."body"
  AND o."enabled" = p."defaultEnabled"
  AND o."attachment" = p."defaultAttachment";
