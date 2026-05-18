import type { PrismaClient } from '@arcade/db';
import { Prisma } from '@arcade/db';
import type { Request } from 'express';

function jsonValue(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (v === undefined || v === null) return Prisma.JsonNull;
  return v as Prisma.InputJsonValue;
}

export async function writeAudit(
  db: PrismaClient,
  req: Request,
  args: {
    action: string;
    entityType: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      tenantId: req.auth!.tenantId,
      actorUserId: req.auth!.userId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      before: jsonValue(args.before),
      after: jsonValue(args.after),
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    },
  });
}
