import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../errors.js';
import { logger } from '../logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof ZodError) {
    res.status(422).json({
      error: { code: 'validation_failed', message: 'Validation error', details: err.flatten() },
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code ?? 'error', message: err.message, details: err.details },
    });
    return;
  }
  logger.error({ err, path: req.path }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal', message: 'Internal server error' } });
};
