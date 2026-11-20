import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChannelPage } from '../src/sources/channel-web';
import {
  buildEnglishHtml,
  buildTranslationSourceHtml,
  finishTranslatedHtml,
  htmlToPlain,
  isSignal,
} from '../src/signals';

const page = readFileSync(new URL('./fixtures/channel-page.html', import.meta.url), 'utf8');

test('parses posts from the web preview, oldest first, only for the wanted channel', () => {
  const posts = parseChannelPage(page, 'EN4XC');
  assert.deepEqual(posts.map((p) => p.id), [100, 102]);
  assert.equal(posts[0].text, 'Weekly outlook & market wrap.');
  assert.equal(posts[0].link, null);
});

test('a media-only post does not borrow the next post\'s text', () => {
  const posts = parseChannelPage(page, 'EN4XC');
  assert.equal(posts.find((p) => p.id === 101), undefined);
});

test('extracts signal text with emoji and line breaks, and the Market Chart link', () => {
  const sig = parseChannelPage(page, 'en4xc').find((p) => p.id === 102)!;
  assert.ok(sig.text.startsWith('📉 [Sell Limit] GBPUSDxx - Bearish'));
  assert.ok(sig.text.includes('\n\n▪ Our short term bias remains negative.'));
  assert.ok(sig.text.includes('Confidence: ⭐⭐⭐\n⛔ Stop: 1.3161'));
  assert.ok(sig.text.endsWith('Market Chart'));
  assert.equal(sig.link, 'https://charts.example.com/GBPUSD.png?a=1&b=2');
  // The inline "Trade Now" button sits outside the text and is ignored.
  assert.ok(!sig.text.includes('Trade Now'));
});

test('isSignal matches the old bots\' keywords, case-insensitively', () => {
  for (const t of ['[Live Trade] x', '[Buy Limit] x', 'buy stop', 'SELL LIMIT', 'Sell Stop']) assert.ok(isSignal(t), t);
  assert.ok(!isSignal('Weekly outlook'));
  assert.ok(!isSignal(null));
});

test('English post: strips the xx suffix, escapes HTML, links Market Chart', () => {
  const html = buildEnglishHtml('[Buy Limit] EURUSDxx <b> & co\nMarket Chart', 'https://x.example/c.png?a=1&b="2"');
  assert.equal(
    html,
    '[Buy Limit] EURUSD &lt;b&gt; &amp; co\n<a href="https://x.example/c.png?a=1&amp;b=&quot;2&quot;">Market Chart</a>',
  );
});

test('English post without a link keeps the plain label', () => {
  assert.equal(buildEnglishHtml('[Live Trade] XAUUSDxx\nMarket Chart', null), '[Live Trade] XAUUSD\nMarket Chart');
});

test('translation source protects symbols, keeps the link as a tag, and encodes line breaks', () => {
  const html = buildTranslationSourceHtml('📉 [Sell Limit] GBPUSDxx - Bearish\nMarket Chart', 'https://c.example/a.png');
  assert.equal(
    html,
    '📉 [Sell Limit] <span translate="no">GBPUSD</span> - Bearish<br><a href="https://c.example/a.png">Market Chart</a>',
  );
});

test('translated HTML is turned back into Telegram HTML', () => {
  const google =
    '📉 [Limite de vente] <span translate="no">GBPUSD</span> - Baissier <br> Arrêt : 1,3161 <br><br> <a href="https://c.example/a.png">Graphique du marché</a>';
  assert.equal(
    finishTranslatedHtml(google),
    '📉 [Limite de vente] GBPUSD - Baissier\nArrêt : 1,3161\n\n<a href="https://c.example/a.png">Graphique du marché</a>',
  );
  // Leftover broker suffixes in Latin or Cyrillic are dropped, as the old bot did.
  assert.equal(finishTranslatedHtml('EURUSDxx и EURUSDхх'), 'EURUSD и EURUSD');
});

test('plain-text fallback strips tags and decodes entities', () => {
  assert.equal(htmlToPlain('<a href="u">Chart</a> &amp; &lt;x&gt; &#39;q&#39;'), "Chart & <x> 'q'");
});
