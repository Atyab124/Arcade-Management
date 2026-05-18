/**
 * WhatsApp opt-out keyword detector.
 *
 * Meta's Cloud API does NOT auto-handle STOP keywords for WhatsApp (only SMS via Twilio).
 * We must build keyword detection ourselves. This list covers English + Bahasa Malaysia
 * + common variants seen in production WhatsApp deployments.
 *
 * Detection is conservative: we match whole-word case-insensitive on a single-token reply.
 * Multi-word replies (e.g. "please stop sending messages") still match because we tokenize.
 */

const STOP_KEYWORDS: ReadonlySet<string> = new Set([
  // English
  'stop',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'optout',
  'opt-out',
  'remove',
  // Bahasa Malaysia
  'berhenti',
  'henti',
  'batal',
  'tidakmahu',
  // Chinese (Mandarin) — many MY arcade customers are Chinese-speaking
  '停止',
  '退订',
  '取消',
]);

const START_KEYWORDS: ReadonlySet<string> = new Set([
  'start',
  'subscribe',
  'optin',
  'opt-in',
  'yes',
  'mula',
  'sertai',
]);

/**
 * Returns 'opt_out' if the message body is recognised as an unsubscribe request,
 * 'opt_in' if it's a resubscribe, or null otherwise.
 */
export function detectConsentKeyword(body: string | undefined | null): 'opt_in' | 'opt_out' | null {
  if (!body) return null;
  // Lowercase and split on whitespace + punctuation. Keep Unicode letters via \p{L}.
  const tokens = body
    .toLowerCase()
    .split(/[\s.,!?;:'"\-]+/)
    .filter(Boolean);
  for (const token of tokens) {
    if (STOP_KEYWORDS.has(token)) return 'opt_out';
    if (START_KEYWORDS.has(token)) return 'opt_in';
  }
  return null;
}
