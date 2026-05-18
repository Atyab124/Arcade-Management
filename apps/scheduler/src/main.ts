import 'dotenv/config';
import { logger } from './logger.js';
import { processBookingReminders } from './jobs/booking-reminders.js';
import { processPostEventFeedback } from './jobs/post-event-feedback.js';
import { processBirthdays } from './jobs/birthday-greetings.js';
import { processReEngagement } from './jobs/re-engagement.js';
import { processPointsExpiry } from './jobs/points-expiry.js';
import { startWhatsAppWorker } from './jobs/whatsapp-worker.js';

const FIFTEEN_MIN = 15 * 60_000;
const ONE_HOUR = 3600_000;
const ONE_DAY = 86_400_000;

async function safe(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error({ err, job: name }, 'scheduled job failed');
  }
}

async function main() {
  logger.info('▶ scheduler starting');

  // Start the whatsapp send worker (consumer of the BullMQ queue)
  startWhatsAppWorker();

  // Booking reminders run every 15 minutes — the per-flag idempotency guarantees no
  // duplicate sends even if the interval changes.
  setInterval(() => { void safe('booking-reminders', processBookingReminders); }, FIFTEEN_MIN);

  // Post-event feedback hourly
  setInterval(() => { void safe('post-event-feedback', processPostEventFeedback); }, ONE_HOUR);

  // Daily jobs — birthdays, re-engagement, points expiry
  setInterval(() => { void safe('birthdays', processBirthdays); }, ONE_DAY);
  setInterval(() => { void safe('re-engagement', processReEngagement); }, ONE_DAY);
  setInterval(() => { void safe('points-expiry', processPointsExpiry); }, ONE_DAY);

  // Initial run on boot so we don't wait for the first interval tick
  void safe('booking-reminders', processBookingReminders);
  void safe('post-event-feedback', processPostEventFeedback);

  logger.info('✓ scheduler ready');
}

main().catch(err => {
  logger.error({ err }, 'scheduler crashed');
  process.exit(1);
});
