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

/** English premium post: the source text with the broker "xx" symbol suffix removed and the chart linked. */
export function buildEnglishHtml(text: string, link: string | null): string {
  return linkChart(escapeHtml(text.split('xx').join('')), link);
}

/**
 * HTML sent to Google Translate. Instrument symbols ("GBPUSDxx") are
 * wrapped in translate="no" so they come back untouched, and line breaks
 * become <br> because HTML mode would otherwise collapse them.
 */
export function buildTranslationSourceHtml(text: string, link: string | null): string {
  let html = escapeHtml(text).replace(/\b([A-Z0-9]{3,12})xx\b/g, '<span translate="no">$1</span>');
  html = html.split('xx').join('');
  html = linkChart(html, link);
  return html.replace(/\n/g, '<br>');
}

/** Turn Google's HTML output back into Telegram-HTML. */
export function finishTranslatedHtml(translated: string): string {
  return translated
    .replace(/\s*<br\s*\/?>\s?/gi, '\n')
    .replace(/<span[^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    .split('xx').join('')
    .split('хх').join('') // Cyrillic "хх", as stripped by the old bot
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** Strip Telegram-HTML to plain text — the fallback when Telegram rejects our markup. */
export function htmlToPlain(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ''));
}
