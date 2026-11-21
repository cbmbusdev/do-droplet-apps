// Translation with a line cache and a hard monthly character cap.
//
// Measured on two weeks of @EN4XC: ~150-260k characters a day would go
// to Google if each signal were translated whole into 19 languages
// (the free tier is 500k a MONTH). The posts reuse the same lines with
// different prices, so each line is masked and translated once per
// language; after the first week that's ~1-14k characters a day.
//
// The cap is the guarantee: before every Google call the Worker
// reserves the request's characters against TRANSLATE_MONTHLY_CHAR_BUDGET
// atomically in D1. When the month's budget is used up, lines not yet in
// the cache stay in English until the next month; nothing is billed.

import { decodeEntities, escapeHtml } from './signals';

export interface Masked {
  /** Leading emoji/bullets, kept outside translation. */
  prefix: string;
  /** Line with values replaced by {{0}}, {{1}}, ... — the cache key. */
  template: string;
  values: string[];
}

const PREFIX_RE = /^[^\p{L}\p{N}[]+/u;
// Stars, instrument symbols (EURUSD, XAUUSD, US500 — "xx" already
// stripped), then numbers (prices, dates, times).
const VALUE_RE = /[★⭐✩✰]+|\b[A-Z][A-Z0-9]{4,11}\b|\d+(?:[.,:]\d+)*/g;

export function maskLine(line: string): Masked {
  const prefix = PREFIX_RE.exec(line)?.[0] ?? '';
  const values: string[] = [];
  const template = line
    .slice(prefix.length)
    .replace(VALUE_RE, (v) => `{{${values.push(v) - 1}}}`)
    .trimEnd();
  return { prefix, template, values };
}

export function unmask(template: string, values: string[]): string {
  return template.replace(/\{\{(\d+)\}\}/g, (_, i) => values[Number(i)] ?? '');
}

/** True when the line has words worth translating. */
export function needsTranslation(template: string): boolean {
  return /\p{L}/u.test(template.replace(/\{\{\d+\}\}/g, ''));
}

/** What is sent to Google: placeholders become untranslatable spans. */
export function toGoogleHtml(template: string): string {
  return escapeHtml(template).replace(/\{\{(\d+)\}\}/g, '<span translate="no">$1</span>');
}

/** Google's output back to a template; null if a placeholder went missing or doubled. */
export function fromGoogleHtml(html: string, expectedPlaceholders: number): string | null {
  const template = decodeEntities(
    html
      .replace(/<span[^>]*>\s*(\d+)\s*<\/span>/gi, '{{$1}}')
      .replace(/<[^>]+>/g, ''),
  ).trim();
  const found = [...template.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
  if (found.length !== expectedPlaceholders) return null;
  for (let i = 0; i < found.length; i++) if (found[i] !== i) return null;
  return template;
}

/** Google bills by calendar month in US Pacific time; UTC-8 is close enough with the budget's margin. */
export function billingMonth(nowMs: number): string {
  return new Date(nowMs - 8 * 3_600_000).toISOString().slice(0, 7);
}

/** Atomically reserve characters against this month's budget. */
export async function reserveChars(db: D1Database, month: string, chars: number, budget: number): Promise<boolean> {
  if (chars > budget) return false;
  await db.prepare('INSERT OR IGNORE INTO translate_usage (month, chars) VALUES (?1, 0)').bind(month).run();
  const r = await db
    .prepare('UPDATE translate_usage SET chars = chars + ?2 WHERE month = ?1 AND chars + ?2 <= ?3')
    .bind(month, chars, budget)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export type GoogleBatch = (texts: string[], target: string) => Promise<string[]>;

export interface TranslateDeps {
  db: D1Database;
  google: GoogleBatch;
  budget: number;
  now: () => number;
  /** Told when lines stayed English because the month's budget is spent. */
  onBudgetExhausted?: (month: string, lang: string, lines: number) => Promise<void>;
}

export interface LinesResult {
  lines: string[];
  /** Characters sent to Google for this call (0 when fully cached). */
  googleChars: number;
  /** Lines left in English because of the budget or a bad translation. */
  untranslated: number;
}

const LOOKUP_CHUNK = 90; // D1 allows 100 bound parameters per statement

/** Translate text line by line through the cache. Returns plain (unescaped) lines. */
export async function translateLines(deps: TranslateDeps, lines: string[], target: string): Promise<LinesResult> {
  const masked = lines.map(maskLine);
  const wanted = [...new Set(masked.filter((m) => needsTranslation(m.template)).map((m) => m.template))];

  const cache = new Map<string, string>();
  for (let i = 0; i < wanted.length; i += LOOKUP_CHUNK) {
    const chunk = wanted.slice(i, i + LOOKUP_CHUNK);
    const rows = await deps.db
      .prepare(`SELECT src, out FROM translations WHERE lang = ?1 AND src IN (${chunk.map((_, j) => `?${j + 2}`).join(',')})`)
      .bind(target, ...chunk)
      .all<{ src: string; out: string }>();
    for (const r of rows.results) cache.set(r.src, r.out);
  }

  const misses = wanted.filter((t) => !cache.has(t));
  let googleChars = 0;
  let untranslated = 0;
  if (misses.length > 0) {
    const payload = misses.map(toGoogleHtml);
    const chars = payload.reduce((n, s) => n + s.length, 0);
    const month = billingMonth(deps.now());
    if (await reserveChars(deps.db, month, chars, deps.budget)) {
      googleChars = chars;
      const out = await deps.google(payload, target);
      const now = deps.now();
      const inserts: D1PreparedStatement[] = [];
      misses.forEach((src, i) => {
        const placeholders = (src.match(/\{\{\d+\}\}/g) ?? []).length;
        const translated = out[i] === undefined ? null : fromGoogleHtml(out[i], placeholders);
        if (translated === null) return; // left in English below; not cached, so a later post retries it
        cache.set(src, translated);
        inserts.push(
          deps.db
            .prepare('INSERT OR REPLACE INTO translations (lang, src, out, created_at) VALUES (?1, ?2, ?3, ?4)')
            .bind(target, src, translated, now),
        );
      });
      if (inserts.length) await deps.db.batch(inserts);
    } else if (deps.onBudgetExhausted) {
      await deps.onBudgetExhausted(month, target, misses.length);
    }
  }

  const result = masked.map((m, i) => {
    if (!needsTranslation(m.template)) return lines[i];
    const t = cache.get(m.template);
    if (t === undefined) {
      untranslated += 1;
      return lines[i];
    }
    return m.prefix + unmask(t, m.values);
  });
  return { lines: result, googleChars, untranslated };
}
