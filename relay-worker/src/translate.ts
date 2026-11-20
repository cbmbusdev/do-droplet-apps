// Google Cloud Translation (Basic, v2) over REST.

export class TranslateError extends Error {}

export async function translate(
  apiKey: string,
  text: string,
  target: string,
  format: 'html' | 'text',
): Promise<string> {
  if (!text.trim()) return text;
  const resp = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, target, source: 'en', format }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!resp.ok) {
    // Never echo the URL: it carries the API key.
    const detail = (await resp.text()).slice(0, 300);
    throw new TranslateError(`Google Translate HTTP ${resp.status} (${target}): ${detail}`);
  }
  const data = (await resp.json()) as { data?: { translations?: Array<{ translatedText?: string }> } };
  const out = data.data?.translations?.[0]?.translatedText;
  if (typeof out !== 'string') throw new TranslateError(`Google Translate returned no text (${target})`);
  return out;
}
