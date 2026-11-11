import { prisma, Prisma } from '../../db/prisma';

export interface AuditInput {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  customerId?: number | null;
  correlationId?: string | null;
  payload: Prisma.InputJsonValue;
}

/**
 * Append-only audit trail.  Every state change that could otherwise look like
 * a silent history rewrite is recorded here first.
 */
export class AuditService {
  async record(input: AuditInput) {
    return prisma.auditEvent.create({
      data: {
        actor: input.actor,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        customerId: input.customerId ?? null,
        correlationId: input.correlationId ?? null,
        payload: input.payload,
      },
    });
  }

  async recordMany(inputs: AuditInput[]) {
    if (!inputs.length) return 0;
    const result = await prisma.auditEvent.createMany({
      data: inputs.map((i) => ({
        actor: i.actor,
        action: i.action,
        entityType: i.entityType,
        entityId: i.entityId,
        customerId: i.customerId ?? null,
        correlationId: i.correlationId ?? null,
        payload: i.payload,
      })),
    });
    return result.count;
  }

  async forEntity(entityType: string, entityId: string, limit = 50) {
    return prisma.auditEvent.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async recent(limit = 50) {
    return prisma.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}

export const auditService = new AuditService();
