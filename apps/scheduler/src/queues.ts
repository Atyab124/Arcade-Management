import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

let _conn: Redis | undefined;
let _queues: { whatsapp: Queue } | undefined;

export function getRedis(): Redis {
  if (!_conn) {
    _conn = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return _conn;
}

export function getQueues() {
  if (!_queues) {
    const connection = getRedis();
    _queues = { whatsapp: new Queue('whatsapp', { connection }) };
  }
  return _queues;
}
