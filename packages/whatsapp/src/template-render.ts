/**
 * Render a stored template body for preview/audit purposes.
 *
 * Variables are referenced as {{key}} in the body string. Meta WhatsApp templates also
 * support positional {{1}}, {{2}} — we accept both forms when rendering.
 *
 * NOTE: when actually sending via Trengo, the template body is NOT transmitted — Trengo
 * sends the approved template by hsm_id with a `params` array. This renderer is purely for
 * (a) human-readable previews in the admin UI, (b) audit logs, and (c) tests.
 */
export function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+|\d+)\s*\}\}/g, (_match, raw: string) => {
    const key = raw.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      return variables[key] ?? '';
    }
    return `{{${raw}}}`;
  });
}

export function extractVariableKeys(body: string): string[] {
  const keys = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+|\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1]) keys.add(m[1].toLowerCase());
  }
  return Array.from(keys);
}
