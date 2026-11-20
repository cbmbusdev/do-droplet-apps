// Google Cloud Translation (Basic, v2) over REST — one request per batch of lines.

export class TranslateError extends Error {}

const MAX_SEGMENTS = 128; // v2 limit on q[] per request

export async function googleTranslateBatch(apiKey: string, texts: string[], target: string): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < texts.length; i += MAX_SEGMENTS) {
    const q = texts.slice(i, i + MAX_SEGMENTS);
    const resp = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, target, source: 'en', format: 'html' }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!resp.ok) {
      // Never echo the URL: it carries the API key.
      const detail = (await resp.text()).slice(0, 300);
      throw new TranslateError(`Google Translate HTTP ${resp.status} (${target}): ${detail}`);
    }
    const data = (await resp.json()) as { data?: { translations?: Array<{ translatedText?: string }> } };
    const t = data.data?.translations;
    if (!t || t.length !== q.length) throw new TranslateError(`Google Translate returned ${t?.length ?? 0}/${q.length} texts (${target})`);
    out.push(...t.map((x) => x.translatedText ?? ''));
  }
  return out;
}
