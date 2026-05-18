import { getServicePrisma, withTenant } from '@arcade/db';
import { logger } from './logger.js';
import { transformRow } from './transform.js';
import type { SheetsSource } from './sheets-source.js';

export interface SyncResult {
  syncRunId: string;
  status: 'success' | 'skipped' | 'error';
  rowsRead: number;
  rowsChanged: number;
  errorCount: number;
  error?: string;
}

/**
 * One sync cycle for a tenant.
 *
 * Strategy (per research):
 *   1. Check Drive.modifiedTime. If unchanged since last successful run, skip the full read.
 *   2. Read rows via batchGet. Pass through staging → typed transform → validation.
 *   3. Compute per-row SHA-256 hash. Upsert ON CONFLICT (tenant_id, phone_e164) DO UPDATE
 *      WITH WHERE row_hash IS DISTINCT FROM (skips no-op writes).
 *   4. Soft-delete rows that disappeared from the sheet (never hard-delete — staff WILL
 *      accidentally delete the wrong row).
 *   5. Log everything to sync_log for audit.
 */
export async function runSyncForTenant(
  tenantId: string,
  spreadsheetId: string,
  source: SheetsSource,
  range = 'Customers!A:Z',
): Promise<SyncResult> {
  const prisma = getServicePrisma();

  // Check modified time gate
  const modified = await source.getModifiedTime(spreadsheetId);
  const lastRun = await prisma.syncRun.findFirst({
    where: { tenantId, status: 'success' },
    orderBy: { startedAt: 'desc' },
  });
  if (modified && lastRun?.sheetModifiedTime && modified <= lastRun.sheetModifiedTime) {
    logger.info({ tenantId, modified }, 'sync skipped — sheet unchanged');
    const run = await prisma.syncRun.create({
      data: {
        tenantId, status: 'success', finishedAt: new Date(),
        sheetModifiedTime: modified, rowsRead: 0, rowsChanged: 0,
      },
    });
    return { syncRunId: run.id, status: 'skipped', rowsRead: 0, rowsChanged: 0, errorCount: 0 };
  }

  const run = await prisma.syncRun.create({
    data: { tenantId, sheetModifiedTime: modified ?? null },
  });

  try {
    const rows = await source.readRows(spreadsheetId, range);
    let changed = 0;
    let errorCount = 0;
    const seenPhones = new Set<string>();

    await withTenant(tenantId, async (tx) => {
      for (const row of rows) {
        const parsed = transformRow(row.values);
        if (!parsed.ok) {
          errorCount++;
          await tx.customerSyncError.create({
            data: {
              tenantId,
              syncRunId: run.id,
              sheetRow: row.rowNumber,
              rawData: row.values as object,
              reason: parsed.error.reason,
              fields: parsed.error.fields,
            },
          });
          await tx.syncLog.create({
            data: {
              tenantId,
              syncRunId: run.id,
              sheetRow: row.rowNumber,
              action: 'error',
              status: 'validation_failed',
              errorMessage: parsed.error.reason,
              changedFields: parsed.error.fields,
            },
          });
          continue;
        }
        const data = parsed.data;
        seenPhones.add(data.phoneE164);

        const existing = await tx.customer.findFirst({
          where: { phoneE164: data.phoneE164, deletedAt: null },
        });

        if (!existing) {
          await tx.customer.create({
            data: {
              tenantId,
              phoneE164: data.phoneE164,
              fullName: data.fullName,
              email: data.email,
              dateOfBirth: data.dateOfBirth,
              membershipType: data.membershipType,
              preferredLang: data.preferredLang,
              notes: data.notes,
              rowHash: data.rowHash,
              sourceRow: row.rowNumber,
              source: 'sheets',
            },
          });
          changed++;
          await tx.syncLog.create({
            data: {
              tenantId, syncRunId: run.id, sheetRow: row.rowNumber,
              domainKey: data.phoneE164, action: 'insert', after: data as object,
            },
          });
        } else if (existing.rowHash !== data.rowHash) {
          await tx.customer.update({
            where: { tenantId_id: { tenantId, id: existing.id } },
            data: {
              fullName: data.fullName,
              email: data.email,
              dateOfBirth: data.dateOfBirth,
              membershipType: data.membershipType,
              preferredLang: data.preferredLang,
              notes: data.notes,
              rowHash: data.rowHash,
              sourceRow: row.rowNumber,
            },
          });
          changed++;
          await tx.syncLog.create({
            data: {
              tenantId, syncRunId: run.id, sheetRow: row.rowNumber,
              domainKey: data.phoneE164, action: 'update',
              before: existing as unknown as object, after: data as object,
            },
          });
        } else {
          await tx.syncLog.create({
            data: {
              tenantId, syncRunId: run.id, sheetRow: row.rowNumber,
              domainKey: data.phoneE164, action: 'skip',
            },
          });
        }
      }

      // Soft-delete customers from this tenant that came from Sheets but no longer appear.
      // NEVER hard-delete — staff accidentally remove rows.
      const sheetsOriginated = await tx.customer.findMany({
        where: { source: 'sheets', deletedAt: null },
      });
      for (const existing of sheetsOriginated) {
        if (!seenPhones.has(existing.phoneE164)) {
          await tx.customer.update({
            where: { tenantId_id: { tenantId, id: existing.id } },
            data: { deletedAt: new Date() },
          });
          await tx.syncLog.create({
            data: {
              tenantId, syncRunId: run.id,
              domainKey: existing.phoneE164, action: 'soft_delete',
              before: existing as unknown as object,
            },
          });
        }
      }
    });

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        rowsRead: rows.length,
        rowsChanged: changed,
      },
    });
    return { syncRunId: run.id, status: 'success', rowsRead: rows.length, rowsChanged: changed, errorCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: 'error', finishedAt: new Date(), errorMessage: message },
    });
    logger.error({ err, tenantId }, 'sync run failed');
    return { syncRunId: run.id, status: 'error', rowsRead: 0, rowsChanged: 0, errorCount: 0, error: message };
  }
}
