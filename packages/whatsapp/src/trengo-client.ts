/**
 * Trengo WhatsApp HTTP client.
 *
 * Base URL: https://app.trengo.com/api/v2 (or .eu)
 * Auth: Authorization: Bearer <personal-access-token>
 * Endpoint: POST /wa_sessions  body: { hsm_id, recipient_phone_number, params: [{type, key, value}] }
 *
 * Key gotcha (from research): `hsm_id` is Trengo's internal template ID, NOT Meta's template
 * name. It's only retrievable by inspecting the template URL in Trengo's settings UI, so we
 * persist the mapping in our `wa_templates.trengo_hsm_id` column.
 */

export interface TrengoSendInput {
  hsmId: string;
  recipientPhoneE164: string;
  params: Array<{ type: 'header' | 'body' | 'button'; key: string; value: string }>;
}

export interface TrengoSendResult {
  messageId: string;
  conversationId?: string;
  raw: unknown;
}

export interface TrengoClient {
  send(input: TrengoSendInput): Promise<TrengoSendResult>;
}

export class HttpTrengoClient implements TrengoClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async send(input: TrengoSendInput): Promise<TrengoSendResult> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/wa_sessions`;
    const res = await this.fetcher(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        hsm_id: input.hsmId,
        recipient_phone_number: input.recipientPhoneE164,
        params: input.params.map(p => ({ type: p.type, key: p.key, value: p.value })),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new TrengoApiError(`Trengo send failed: ${res.status} ${res.statusText} ${text}`, res.status);
    }
    const body = await res.json() as Record<string, unknown>;
    const messageId = extractString(body, ['message', 'id']) ?? extractString(body, ['id']);
    if (!messageId) {
      throw new TrengoApiError('Trengo send: response did not include a message id', 200);
    }
    return {
      messageId,
      conversationId: extractString(body, ['conversation', 'id']) ?? undefined,
      raw: body,
    };
  }
}

function extractString(obj: unknown, path: string[]): string | null {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return null;
    }
  }
  if (typeof cur === 'string') return cur;
  if (typeof cur === 'number') return String(cur);
  return null;
}

export class TrengoApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'TrengoApiError';
  }
}

/**
 * Test double — used in unit tests and when TRENGO_TOKEN is not configured (e.g. local dev
 * without a real Trengo account). Records calls in memory so tests can assert against them.
 */
export class FakeTrengoClient implements TrengoClient {
  public readonly calls: TrengoSendInput[] = [];
  constructor(private readonly nextMessageId: () => string = () => `fake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) {}
  async send(input: TrengoSendInput): Promise<TrengoSendResult> {
    this.calls.push(input);
    return { messageId: this.nextMessageId(), raw: { fake: true } };
  }
}
