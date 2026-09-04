import 'server-only';
import { db } from '../../db/client';
import { auditEvents } from '../../db/schema';

export async function recordAuditEvent(input: {
  organizationId: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(auditEvents).values({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: input.metadata ?? {},
  });
}
