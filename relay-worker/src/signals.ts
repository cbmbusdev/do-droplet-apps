// Signal text handling, ported from updated_app1/updated_app2.
//
// The old bots sent Pyrogram markdown and patched the translated
// "Market Chart" phrase back into a link with a per-language lookup
// table. Here the link travels through Google Translate as a real
// <a> tag (format=html), so no lookup table is needed and the link
// survives in every language.

const SIGNAL_PATTERN = /Live Trade|Buy Limit|Buy Stop|Sell Limit|Sell Stop/i;

export function isSignal(text: string | null | undefined): boolean {
  return !!text && SIGNAL_PATTERN.test(text);
}

/**
 * The provider's rating from a "Confidence: ⭐⭐⭐" line, or null when the
 * post has none. Counts the same star characters as the FTI trading
 * worker's parser, so both apply the same threshold to the same post.
 */
export function confidenceStars(text: string): number | null {
  for (const line of text.split('\n')) {
    const m = /\bconfidence\b\s*[:\-]?\s*(.+)$/i.exec(line);
    if (m) return (m[1].match(/[★⭐✩✰]/gu) ?? []).length;
  }
  return null;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

const CHART_LABEL = 'Market Chart';

function linkChart(escapedText: string, link: string | null): string {
  if (!link) return escapedText;
  return escapedText.split(CHART_LABEL).join(`<a href="${escapeAttr(link)}">${CHART_LABEL}</a>`);
}

/** The broker's symbol suffix ("GBPUSDxx"), removed everywhere as the old bots did. */
export function stripBrokerSuffix(text: string): string {
  return text.split('xx').join('');
}

/** English premium post: the source text with the broker "xx" symbol suffix removed and the chart linked. */
export function buildEnglishHtml(text: string, link: string | null): string {
  return linkChart(escapeHtml(stripBrokerSuffix(text)), link);
}

/**
 * Translated premium post from English lines and their translations
 * (same length, same order). The line that reads "Market Chart" in
 * English becomes the link, whatever the translation says.
 */
export function buildTranslatedHtml(english: string[], translated: string[], link: string | null): string {
  return translated
    .map((line, i) => {
      if (link && english[i].trim() === CHART_LABEL) return `<a href="${escapeAttr(link)}">${escapeHtml(line.trim())}</a>`;
      return escapeHtml(line);
    })
    .join('\n')
    .trim();
}

/** Strip Telegram-HTML to plain text — the fallback when Telegram rejects our markup. */
export function htmlToPlain(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ''));
}
