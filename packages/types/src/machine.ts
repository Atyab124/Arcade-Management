import { z } from 'zod';
import { MachineStatus } from './enums.js';

export const MachineCreateSchema = z.object({
  name: z.string().min(1).max(100),
  model: z.string().max(100).optional(),
  locationZone: z.string().max(60).optional(),
  installDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum([
    MachineStatus.IN_SERVICE,
    MachineStatus.OUT_OF_SERVICE,
    MachineStatus.DECOMMISSIONED,
  ]).default(MachineStatus.IN_SERVICE),
});
export type MachineCreate = z.infer<typeof MachineCreateSchema>;

export const ServiceRequestCreateSchema = z.object({
  machineId: z.string().uuid(),
  description: z.string().min(1).max(2000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});
export type ServiceRequestCreate = z.infer<typeof ServiceRequestCreateSchema>;

export const ServiceRequestResolveSchema = z.object({
  resolutionNotes: z.string().min(1).max(2000),
});
export type ServiceRequestResolve = z.infer<typeof ServiceRequestResolveSchema>;

export const MaintenanceTaskCreateSchema = z.object({
  machineId: z.string().uuid(),
  type: z.enum(['routine', 'repair', 'inspection']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  scheduledFor: z.string().datetime(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional(),
});
export type MaintenanceTaskCreate = z.infer<typeof MaintenanceTaskCreateSchema>;

export const MaintenanceTaskCompleteSchema = z.object({
  notes: z.string().max(2000).optional(),
  partsUsed: z.array(z.object({
    name: z.string(),
    qty: z.number().int().min(1),
    cost: z.number().min(0).optional(),
  })).default([]),
});
export type MaintenanceTaskComplete = z.infer<typeof MaintenanceTaskCompleteSchema>;
