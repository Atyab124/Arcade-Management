import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import rateLimit from 'express-rate-limit';
import { logger } from './logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.js';
import { customersRouter } from './routes/customers.js';
import { posRouter } from './routes/pos.js';
import { bookingsRouter } from './routes/bookings.js';
import { loyaltyRouter } from './routes/loyalty.js';
import { machinesRouter } from './routes/machines.js';
import { reportsRouter } from './routes/reports.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { webhooksRouter } from './routes/webhooks.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  // Health checks (no auth)
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/readyz', (_req, res) => res.json({ ready: true }));

  // Strict rate limit on auth endpoints
  app.use('/auth', rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true }), authRouter);

  // Webhook receivers — different rate limit, no auth (signature-verified internally)
  app.use('/webhooks', rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true }), webhooksRouter);

  // Main API
  const apiLimit = rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true });
  app.use('/customers', apiLimit, customersRouter);
  app.use('/pos', apiLimit, posRouter);
  app.use('/bookings', apiLimit, bookingsRouter);
  app.use('/loyalty', apiLimit, loyaltyRouter);
  app.use('/machines', apiLimit, machinesRouter);
  app.use('/reports', apiLimit, reportsRouter);
  app.use('/whatsapp', apiLimit, whatsappRouter);

  app.use(errorHandler);
  return app;
}
