import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTranslatedHtml } from '../src/signals';
import {
  billingMonth,
  fromGoogleHtml,
  maskLine,
  reserveChars,
  toGoogleHtml,
  translateLines,
  unmask,
} from '../src/translation';
import { sqliteD1 } from './helpers/sqlite-d1';

function db() {
  const h = sqliteD1();
  for (const f of ['0001_init.sql', '0002_translation_cache.sql']) {
    h.sqlite.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  return h.db;
}

test('lines are masked so the same sentence with other prices shares one cache entry', () => {
  const a = maskLine('📉 [Sell Limit] GBPUSD - Bearish - We look to Sell at 1.3114 ');
  const b = maskLine('📉 [Sell Limit] EURJPY - Bearish - We look to Sell at 174.78');
  assert.equal(a.prefix, '📉 ');
  assert.equal(a.template, '[Sell Limit] {{0}} - Bearish - We look to Sell at {{1}}');
  assert.equal(a.template, b.template);
  assert.deepEqual(b.values, ['EURJPY', '174.78']);
  assert.equal(maskLine('⌛ Expires: 2026-11-20 21:00 (GMT+00:00)').template, 'Expires: {{0}}-{{1}}-{{2}} {{3}} (GMT+{{4}})');
  assert.equal(maskLine('Confidence: ⭐⭐⭐').template, maskLine('Confidence: ⭐⭐⭐⭐').template);
  // Short indicator names are words, not symbols.
  assert.equal(maskLine('▪ 20 1hour EMA is at 1.3110.').template, '{{0}} {{1}}hour EMA is at {{2}}.');
  assert.equal(unmask('Vendre à {{1}} ({{0}})', ['GBPUSD', '1.31']), 'Vendre à 1.31 (GBPUSD)');
});

test('placeholders travel to Google as untranslatable spans and are checked on return', () => {
  assert.equal(toGoogleHtml('Sell at {{0}} & <go>'), 'Sell at <span translate="no">0</span> &amp; &lt;go&gt;');
  assert.equal(fromGoogleHtml('Vendre à <span translate="no">0</span> &amp; plus', 1), 'Vendre à {{0}} & plus');
  assert.equal(fromGoogleHtml('Vendre', 1), null); // placeholder lost
  assert.equal(fromGoogleHtml('<span>0</span> <span>0</span>', 1), null); // duplicated
});

test('billing month follows US Pacific time', () => {
  assert.equal(billingMonth(Date.parse('2026-12-01T07:59:00Z')), '2026-11');
  assert.equal(billingMonth(Date.parse('2026-12-01T08:00:00Z')), '2026-12');
});

test('the monthly budget is a hard cap', async () => {
  const d = db();
  assert.equal(await reserveChars(d, '2026-11', 300, 1000), true);
  assert.equal(await reserveChars(d, '2026-11', 700, 1000), true);
  assert.equal(await reserveChars(d, '2026-11', 1, 1000), false);
  assert.equal(await reserveChars(d, '2026-12', 1000, 1000), true); // new month, fresh budget
  assert.equal(await reserveChars(d, '2026-12', 2000, 1000), false);
});

const fakeGoogle = (log: string[][]) => async (texts: string[], lang: string) => {
  log.push(texts);
  return texts.map((t) => `[${lang}] ${t}`);
};

test('only uncached lines go to Google; numbers are restored per post', async () => {
  const d = db();
  const calls: string[][] = [];
  const deps = { db: d, google: fakeGoogle(calls), budget: 10_000, now: () => Date.parse('2026-11-20T12:00:00Z') };
  const first = await translateLines(deps, ['⛔ Stop: 1.3161', '', 'Market Chart'], 'fr');
  assert.deepEqual(first.lines, ['⛔ [fr] Stop: 1.3161', '', '[fr] Market Chart']);
  assert.ok(first.googleChars > 0);
  const second = await translateLines(deps, ['⛔ Stop: 0.9175', 'Market Chart'], 'fr');
  assert.deepEqual(second.lines, ['⛔ [fr] Stop: 0.9175', '[fr] Market Chart']);
  assert.equal(second.googleChars, 0);
  assert.equal(calls.length, 1);
  // Each language has its own cache.
  await translateLines(deps, ['⛔ Stop: 1'], 'de');
  assert.equal(calls.length, 2);
});

test('lines with no words (prices, emoji, blank) are never sent to Google', async () => {
  const calls: string[][] = [];
  const r = await translateLines(
    { db: db(), google: fakeGoogle(calls), budget: 10_000, now: () => 0 },
    ['⭐⭐⭐', '1.2345', '', '🎯'],
    'es',
  );
  assert.deepEqual(r.lines, ['⭐⭐⭐', '1.2345', '', '🎯']);
  assert.equal(calls.length, 0);
});

test('when the budget is used up, new lines stay English and nothing is sent to Google', async () => {
  const d = db();
  const calls: string[][] = [];
  let exhausted = 0;
  const deps = {
    db: d,
    google: fakeGoogle(calls),
    budget: 40,
    now: () => Date.parse('2026-11-20T12:00:00Z'),
    onBudgetExhausted: async () => void (exhausted += 1),
  };
  const ok = await translateLines(deps, ['Stop: 1'], 'it'); // "Stop: <span translate="no">0</span>" = 36 chars
  assert.equal(ok.untranslated, 0);
  const over = await translateLines(deps, ['Stop: 2', 'Our short term bias remains negative.'], 'it');
  assert.deepEqual(over.lines, ['[it] Stop: 2', 'Our short term bias remains negative.']); // cached line still translated
  assert.equal(over.untranslated, 1);
  assert.equal(exhausted, 1);
  assert.equal(calls.length, 1);
});

test('a translation that loses a placeholder is not cached and the line stays English', async () => {
  const d = db();
  const deps = { db: d, google: async (t: string[]) => t.map(() => 'Arrêt'), budget: 10_000, now: () => 0 };
  const r = await translateLines(deps, ['Stop: 1.3161'], 'fr');
  assert.deepEqual(r.lines, ['Stop: 1.3161']);
  assert.equal(r.untranslated, 1);
  assert.equal(await d.prepare('SELECT COUNT(*) AS n FROM translations').first('n'), 0);
});

test('the English "Market Chart" line becomes the link in any language', () => {
  assert.equal(
    buildTranslatedHtml(['[Sell Limit] GBPUSD', 'Market Chart'], ['[Limite] GBPUSD <x>', ' Graphique du marché '], 'https://c/a.png?a=1&b=2'),
    '[Limite] GBPUSD &lt;x&gt;\n<a href="https://c/a.png?a=1&amp;b=2">Graphique du marché</a>',
  );
  assert.equal(buildTranslatedHtml(['Market Chart'], ['Gráfico'], null), 'Gráfico');
});
