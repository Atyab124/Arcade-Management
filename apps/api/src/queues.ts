import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { getConfig } from './config.js';

let _conn: Redis | undefined;
let _queues: { whatsapp: Queue; reminders: Queue; sync: Queue } | undefined;

export function getRedis(): Redis {
  if (!_conn) {
    _conn = new Redis(getConfig().REDIS_URL, { maxRetriesPerRequest: null });
  }
  return _conn;
}

export function getQueues() {
  if (!_queues) {
    const connection = getRedis();
    _queues = {
      whatsapp: new Queue('whatsapp', { connection }),
      reminders: new Queue('reminders', { connection }),
      sync: new Queue('sync', { connection }),
    };
  }
  return _queues;
}
