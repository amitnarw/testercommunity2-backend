export interface AuditLogPayload {
  actorId: number;
  actorRole: string;
  module: string;
  action: string;
  targetId: number;
  result: string;
  reason?: string;
  ip: string;
  ua: string;
}
