export interface AuditLogPayload {
  actorId: string;
  actorRole: string;
  module: string;
  action: string;
  targetId: string;
  result: string;
  reason?: string;
  ip: string;
  ua: string;
}
