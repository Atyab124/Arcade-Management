import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { withTenant, type PrismaClient } from '@arcade/db';
import { Unauthorized } from '../errors.js';

/**
 * Route adapter: wraps a tenant-scoped handler in a Prisma transaction that has
 * `app.tenant_id` set so RLS policies enforce isolation.
 *
 * The handler returns a value; we serialize it as JSON. To send a non-JSON response,
 * write to `res` directly and return undefined.
 */
export type TenantHandler = (
  req: Request,
  res: Response,
  db: PrismaClient,
) => Promise<unknown> | unknown;

export function tenantRoute(handler: TenantHandler): RequestHandler {
  return async (req, res, next) => {
    if (!req.auth) return next(Unauthorized());
    try {
      const result = await withTenant(req.auth.tenantId, async (tx) => {
        return handler(req, res, tx);
      });
      if (res.headersSent) return;
      if (result === undefined) {
        res.status(204).end();
      } else {
        res.json(result);
      }
    } catch (err) {
      next(err);
    }
  };
}
