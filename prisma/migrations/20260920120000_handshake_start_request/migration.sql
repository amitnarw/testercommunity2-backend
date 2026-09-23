-- Handshake "Request to Start Testing" flow: owners with >= 12 testers joined
-- send a request that an admin must approve. START_REQUESTED keeps the
-- campaign joinable (Discover filters treat it as AVAILABLE) while the
-- request is pending. Enum ADD VALUE is safe: no row rewrite, and the
-- label is new so no existing row references it.
ALTER TYPE "DashboardAndHubStatus" ADD VALUE IF NOT EXISTS 'START_REQUESTED';
