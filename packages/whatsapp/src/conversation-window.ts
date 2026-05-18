/**
 * WhatsApp 24-hour customer service window tracking.
 *
 * Each inbound message from a customer opens a 24-hour window during which the business may
 * send free-form (non-template) Utility/Service messages. Outside the window, only approved
 * templates may be sent. We persist `conversation_window_until` per outbound message based on
 * the latest inbound timestamp known at send time.
 *
 * This is server-authoritative — client clocks must not be trusted (research note from Meta
 * docs).
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;

export function computeWindowExpiry(lastInboundAt: Date | null | undefined, now: Date = new Date()): Date | null {
  if (!lastInboundAt) return null;
  const expiry = new Date(lastInboundAt.getTime() + WINDOW_MS);
  return expiry > now ? expiry : null;
}

export function isWithinWindow(lastInboundAt: Date | null | undefined, now: Date = new Date()): boolean {
  return computeWindowExpiry(lastInboundAt, now) !== null;
}
