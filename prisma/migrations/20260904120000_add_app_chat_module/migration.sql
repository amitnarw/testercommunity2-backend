-- Add app_chat permission module
INSERT INTO "module" ("name", "createdAt", "updatedAt")
VALUES ('app_chat', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Grant admin role: canReadList + canDelete on app_chat
INSERT INTO "permission" ("roleId", "moduleId", "canReadList", "canReadSingle", "canCreate", "canUpdate", "canDelete", "createdAt", "updatedAt")
SELECT r.id, m.id, true, true, false, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "role" r, "module" m
WHERE r.name = 'admin' AND m.name = 'app_chat'
ON CONFLICT ("roleId", "moduleId") DO NOTHING;

-- Grant support role: canReadList only on app_chat
INSERT INTO "permission" ("roleId", "moduleId", "canReadList", "canReadSingle", "canCreate", "canUpdate", "canDelete", "createdAt", "updatedAt")
SELECT r.id, m.id, true, true, false, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "role" r, "module" m
WHERE r.name = 'support' AND m.name = 'app_chat'
ON CONFLICT ("roleId", "moduleId") DO NOTHING;
