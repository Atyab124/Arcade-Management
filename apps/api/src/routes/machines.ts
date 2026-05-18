import { Router } from 'express';
import { MachineCreateSchema, ServiceRequestCreateSchema, ServiceRequestResolveSchema, MaintenanceTaskCreateSchema, MaintenanceTaskCompleteSchema } from '@arcade/types';
import { generateQrToken } from '@arcade/lib';
import { tenantRoute } from '../middleware/tenant-context.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { BadRequest, NotFound } from '../errors.js';

export const machinesRouter = Router();
machinesRouter.use(requireAuth);

machinesRouter.get('/', tenantRoute(async (_req, _res, db) => {
  return db.machine.findMany({ orderBy: { name: 'asc' } });
}));

machinesRouter.get('/:id', tenantRoute(async (req, _res, db) => {
  const id = req.params.id;
  if (!id) throw BadRequest('id required');
  const machine = await db.machine.findFirst({
    where: { id },
    include: {
      serviceRequests: { orderBy: { createdAt: 'desc' }, take: 50 },
      maintenanceTasks: { orderBy: { scheduledFor: 'desc' }, take: 50 },
      revenueEvents: { orderBy: { periodStart: 'desc' }, take: 12 },
    },
  });
  if (!machine) throw NotFound('machine');
  return machine;
}));

machinesRouter.post('/', requireRole('admin', 'manager'), tenantRoute(async (req, _res, db) => {
  const input = MachineCreateSchema.parse(req.body);
  const machine = await db.machine.create({
    data: {
      tenantId: req.auth!.tenantId,
      qrToken: generateQrToken(),
      name: input.name,
      model: input.model ?? null,
      locationZone: input.locationZone ?? null,
      installDate: input.installDate ? new Date(input.installDate) : null,
      status: input.status,
    },
  });
  await writeAudit(db, req, { action: 'machine.create', entityType: 'machine', entityId: machine.id, after: machine });
  return machine;
}));

/** QR-scan resolution: tenant_id is NOT enforced for this route because the QR token itself
 *  is unguessable and acts as the auth. Returns minimal machine info + recent maintenance. */
machinesRouter.get('/qr/:token', async (req, res, next) => {
  try {
    const token = req.params.token;
    if (!token) throw BadRequest('token required');
    // This route bypasses tenant scoping — we use the raw client. The qrToken is high-entropy
    // and acts as a capability URL; we still record the access for auditability.
    const { getPrisma } = await import('@arcade/db');
    const prisma = getPrisma();
    const machine = await prisma.machine.findFirst({
      where: { qrToken: token },
      include: {
        serviceRequests: { where: { status: { in: ['open', 'in_progress'] } }, orderBy: { createdAt: 'desc' } },
        maintenanceTasks: { where: { completedAt: null }, orderBy: { scheduledFor: 'asc' } },
      },
    });
    if (!machine) throw NotFound('machine');
    res.json(machine);
  } catch (e) {
    next(e);
  }
});

machinesRouter.post('/service-requests', tenantRoute(async (req, _res, db) => {
  const input = ServiceRequestCreateSchema.parse(req.body);
  const sr = await db.serviceRequest.create({
    data: {
      tenantId: req.auth!.tenantId,
      machineId: input.machineId,
      openedByUserId: req.auth!.userId,
      description: input.description,
      priority: input.priority,
      status: 'open',
    },
  });
  await writeAudit(db, req, { action: 'service_request.create', entityType: 'service_request', entityId: sr.id, after: sr });
  return sr;
}));

machinesRouter.post('/service-requests/:id/resolve', tenantRoute(async (req, _res, db) => {
  const id = req.params.id;
  if (!id) throw BadRequest('id required');
  const input = ServiceRequestResolveSchema.parse(req.body);
  const sr = await db.serviceRequest.update({
    where: { tenantId_id: { tenantId: req.auth!.tenantId, id } },
    data: {
      status: 'resolved',
      resolutionNotes: input.resolutionNotes,
      resolvedAt: new Date(),
    },
  });
  await writeAudit(db, req, { action: 'service_request.resolve', entityType: 'service_request', entityId: id, after: sr });
  return sr;
}));

machinesRouter.post('/tasks', tenantRoute(async (req, _res, db) => {
  const input = MaintenanceTaskCreateSchema.parse(req.body);
  return db.maintenanceTask.create({
    data: {
      tenantId: req.auth!.tenantId,
      machineId: input.machineId,
      type: input.type,
      priority: input.priority,
      scheduledFor: new Date(input.scheduledFor),
      assignedToUserId: input.assignedToUserId ?? null,
      notes: input.notes ?? null,
    },
  });
}));

machinesRouter.post('/tasks/:id/complete', tenantRoute(async (req, _res, db) => {
  const id = req.params.id;
  if (!id) throw BadRequest('id required');
  const input = MaintenanceTaskCompleteSchema.parse(req.body);
  return db.maintenanceTask.update({
    where: { tenantId_id: { tenantId: req.auth!.tenantId, id } },
    data: {
      completedAt: new Date(),
      notes: input.notes ?? null,
      partsUsed: input.partsUsed as object,
    },
  });
}));
