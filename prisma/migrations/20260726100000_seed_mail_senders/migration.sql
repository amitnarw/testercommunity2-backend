-- Seed default mail sender addresses
INSERT INTO "mail_sender_address" ("email", "isActive", "createdAt", "updatedAt")
VALUES
  ('support@system.intesters.com', true, NOW(), NOW()),
  ('pro-support@system.intesters.com', true, NOW(), NOW()),
  ('pro-billing@system.intesters.com', true, NOW(), NOW()),
  ('pro-info@system.intesters.com', true, NOW(), NOW()),
  ('noreply@system.intesters.com', true, NOW(), NOW())
ON CONFLICT ("email") DO NOTHING;
