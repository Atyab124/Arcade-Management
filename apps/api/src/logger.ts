import { pino } from 'pino';
import { getConfig } from './config.js';

const config = getConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.tokenHash',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label: string) => ({ level: label }),
  },
});
