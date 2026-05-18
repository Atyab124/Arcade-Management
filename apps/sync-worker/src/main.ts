import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { getServicePrisma } from '@arcade/db';
import { logger } from './logger.js';
import { GoogleSheetsSource, FakeSheetsSource } from './sheets-source.js';
import { runSyncForTenant } from './sync.js';

const INTERVAL_MIN = Number(process.env.SHEETS_SYNC_INTERVAL_MINUTES ?? 15);

async function loadSheetsSource() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && existsSync(path)) {
    const creds = JSON.parse(readFileSync(path, 'utf-8'));
    return new GoogleSheetsSource(creds);
  }
  logger.warn('GOOGLE_APPLICATION_CREDENTIALS not set or file missing — using FakeSheetsSource (no real sync)');
  return new FakeSheetsSource();
}

async function tick() {
  const prisma = getServicePrisma();
  const source = await loadSheetsSource();
  const tenants = await prisma.tenant.findMany();
  for (const tenant of tenants) {
    const settings = tenant.settings as { sheetsId?: string | null };
    if (!settings.sheetsId) {
      logger.debug({ tenantId: tenant.id }, 'tenant has no sheetsId — skipping');
      continue;
    }
    try {
      const result = await runSyncForTenant(tenant.id, settings.sheetsId, source);
      logger.info({ tenantId: tenant.id, ...result }, 'sync completed');
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, 'sync tick failed');
    }
  }
}

async function main() {
  logger.info({ INTERVAL_MIN }, 'sync worker starting');
  await tick();
  setInterval(() => {
    tick().catch(err => logger.error({ err }, 'tick failed'));
  }, INTERVAL_MIN * 60_000);
}

main().catch(err => {
  logger.error({ err }, 'sync worker crashed');
  process.exit(1);
});
