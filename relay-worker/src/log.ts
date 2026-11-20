// Structured JSON logs — searchable in Cloudflare's Workers Logs and `wrangler tail`.

export type Level = 'info' | 'warn' | 'error';

export function log(level: Level, event: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, ...data, ts: new Date().toISOString() });
  // eslint-disable-next-line no-console
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}
