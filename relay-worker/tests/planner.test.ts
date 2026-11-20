import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type Env, LANGUAGES, dayKey, loadConfig } from '../src/config';
import { planChannelPost, planSignal, signalRejection } from '../src/planner';
import { confidenceStars } from '../src/signals';
import type { TgChannelPost } from '../src/telegram';

const cfg = (vars: Partial<Env> = {}) =>
  loadConfig({ TEST_CHAT_ID: '-100999', FLOW_SIGNALS: 'live', FLOW_MEDIA_PRIVATE: 'live', FLOW_MEDIA_PUBLIC: 'live', FLOW_FREEMIUM: 'live', ...vars } as Env);

const NOW = Date.parse('2026-11-20T12:00:00Z');
const SIGNAL = '📉 [Sell Limit] GBPUSDxx - Bearish\nConfidence: ⭐⭐⭐\nMarket Chart';

test('a signal with a chart goes to all 20 premium channels; English untranslated', () => {
  const jobs = planSignal(cfg(), 'EN4XC/1', SIGNAL, 'https://c.example/a.png');
  assert.equal(jobs.length, 20);
  assert.deepEqual(new Set(jobs.map((j) => j.target)), new Set(LANGUAGES.map((l) => l.premium)));
  const en = jobs.find((j) => j.lang === 'en')!;
  assert.equal(en.translateTo, undefined);
  assert.ok(en.html!.includes('<a href="https://c.example/a.png">Market Chart</a>'));
  assert.equal(jobs.find((j) => j.lang === 'zh')!.translateTo, 'zh-CN');
  assert.equal(en.key, 'live:sig:EN4XC/1:en');
  assert.ok(jobs.every((j) => j.freemiumLang === j.lang));
});

test('a signal without a chart only goes to English and French (old app2 skipped it)', () => {
  const jobs = planSignal(cfg(), 'EN4XC/2', '[Live Trade] XAUUSDxx closed\nConfidence: ⭐⭐⭐⭐', null);
  assert.deepEqual(jobs.map((j) => j.lang).sort(), ['en', 'fr']);
});

test('non-signal posts and a switched-off flow produce nothing', () => {
  assert.equal(planSignal(cfg(), 'EN4XC/3', 'Weekly outlook', 'https://c.example/a.png').length, 0);
  assert.equal(planSignal(cfg({ FLOW_SIGNALS: 'off' }), 'EN4XC/4', SIGNAL, 'https://c').length, 0);
});

test('test mode is the default, and is forced off when TEST_CHAT_ID is missing', () => {
  assert.equal(loadConfig({ TEST_CHAT_ID: '-1' } as Env).modes.signals, 'test');
  assert.equal(loadConfig({} as Env).modes.signals, 'off');
  assert.equal(loadConfig({ FLOW_SIGNALS: 'live' } as Env).modes.signals, 'live');
});

test('no freemium teaser is requested when the freemium flow is off', () => {
  const jobs = planSignal(cfg({ FLOW_FREEMIUM: 'off' }), 'EN4XC/5', SIGNAL, 'https://c');
  assert.ok(jobs.every((j) => j.freemiumLang === undefined));
});

const post = (over: Partial<TgChannelPost>): TgChannelPost => ({
  message_id: 7,
  chat: { id: -1001716677263, type: 'channel' },
  ...over,
});

test('media in the English premium channel fans out to the 19 other premium channels, translated', () => {
  const { route, jobs } = planChannelPost(
    cfg(),
    post({ photo: [{ file_id: 'small', width: 1, height: 1 }, { file_id: 'big', width: 9, height: 9 }], caption: 'GBPUSD setup' }),
    NOW,
  );
  assert.equal(route, 'english_premium');
  assert.equal(jobs.length, 19);
  assert.ok(jobs.every((j) => j.kind === 'photo' && j.fileId === 'big' && j.translateTo));
  assert.ok(!jobs.some((j) => j.target === -1001716677263));
});

test('media without a caption is still forwarded, just not translated (the old bot dropped it)', () => {
  const { jobs } = planChannelPost(cfg(), post({ video: { file_id: 'v' } }), NOW);
  assert.equal(jobs.length, 19);
  assert.ok(jobs.every((j) => j.translateTo === undefined && j.caption === ''));
});

test('media in @freemiumtradeideas goes to the 19 public language channels', () => {
  const { route, jobs } = planChannelPost(
    cfg(),
    post({ chat: { id: -100555, username: 'FreemiumTradeIdeas', type: 'channel' }, document: { file_id: 'd' }, caption: 'Hi' }),
    NOW,
  );
  assert.equal(route, 'public_source');
  assert.equal(jobs.length, 19);
  assert.ok(jobs.some((j) => j.target === '@freemiumtradeideaszh'));
  assert.ok(jobs.every((j) => typeof j.target === 'string' && j.kind === 'document'));
});

test('a text post in a premium channel requests that day\'s freemium forward', () => {
  const { route, jobs } = planChannelPost(cfg(), post({ chat: { id: -1001727546393, type: 'channel' }, text: 'hello' }), NOW);
  assert.equal(route, 'premium');
  assert.equal(jobs.length, 1);
  assert.deepEqual(
    { kind: jobs[0].kind, target: jobs[0].target, fromChat: jobs[0].fromChat, key: jobs[0].key },
    { kind: 'forward', target: '@freemiumtradeideasfr', fromChat: -1001727546393, key: 'live:freemium:fr:2026-11-20' },
  );
});

test('the freemium day rolls over at midnight in the configured UTC offset', () => {
  assert.equal(dayKey(Date.parse('2026-11-20T22:59:00Z'), 1), '2026-11-20');
  assert.equal(dayKey(Date.parse('2026-11-20T23:00:00Z'), 1), '2026-11-21');
  assert.equal(dayKey(Date.parse('2026-11-21T00:59:00Z'), -1), '2026-11-20'); // old bot's Etc/GMT+1
});

test('@EN4XC posts arriving by webhook are ignored in web mode, used in bot mode', () => {
  const p = post({
    chat: { id: -1001908926977, username: 'EN4XC', type: 'channel' },
    text: SIGNAL,
    entities: [{ type: 'text_link', url: 'https://c.example/x.png' }],
  });
  assert.equal(planChannelPost(cfg(), p, NOW).jobs.length, 0);
  const jobs = planChannelPost(cfg({ SIGNAL_SOURCE_MODE: 'bot' }), p, NOW).jobs;
  assert.equal(jobs.length, 20);
  assert.ok(jobs.find((j) => j.lang === 'en')!.html!.includes('href="https://c.example/x.png"'));
});

test('posts from channels we do not know are unrouted', () => {
  assert.equal(planChannelPost(cfg(), post({ chat: { id: -100123, type: 'channel' }, text: 'x' }), NOW).route, 'unrouted');
});

// ---- Confidence filter (MIN_CONFIDENCE_STARS, default 3) ----

const rated = (stars: string) => `📈 [Buy Limit] EURUSDxx - Bullish\nConfidence: ${stars}\n⛔ Stop: 1.1\nMarket Chart`;

test('confidence is read from the "Confidence:" line, counting the same stars as the FTI worker', () => {
  assert.equal(confidenceStars(rated('⭐⭐⭐⭐')), 4);
  assert.equal(confidenceStars(rated('★★')), 2);
  assert.equal(confidenceStars('[Buy Limit] EURUSD'), null);
});

test('by default only 3-star and higher signals are forwarded', () => {
  const c = cfg();
  assert.equal(c.minConfidenceStars, 3);
  assert.equal(planSignal(c, 'EN4XC/10', rated('⭐'), 'https://c').length, 0);
  assert.equal(planSignal(c, 'EN4XC/11', rated('⭐⭐'), 'https://c').length, 0);
  assert.equal(planSignal(c, 'EN4XC/12', rated('⭐⭐⭐'), 'https://c').length, 20);
  assert.equal(planSignal(c, 'EN4XC/13', rated('⭐⭐⭐⭐'), 'https://c').length, 20);
  assert.equal(planSignal(c, 'EN4XC/14', rated('⭐⭐⭐⭐⭐'), 'https://c').length, 20);
});

test('unrated signals are not forwarded while the filter is on', () => {
  assert.equal(signalRejection(cfg(), '[Live Trade] EURUSDxx\nMarket Chart'), 'no_confidence_rating');
  assert.equal(signalRejection(cfg(), rated('⭐⭐')), 'confidence_2_below_3');
  assert.equal(signalRejection(cfg(), 'Weekly outlook'), 'not_a_signal');
});

test('the threshold is configurable; 0 forwards everything; junk falls back to 3', () => {
  assert.equal(planSignal(cfg({ MIN_CONFIDENCE_STARS: '4' }), 'EN4XC/20', rated('⭐⭐⭐'), 'https://c').length, 0);
  assert.equal(planSignal(cfg({ MIN_CONFIDENCE_STARS: '0' }), 'EN4XC/21', '[Live Trade] EURUSDxx', 'https://c').length, 20);
  assert.equal(cfg({ MIN_CONFIDENCE_STARS: 'three' }).minConfidenceStars, 3);
});

test('signals arriving by webhook (bot mode) are filtered the same way', () => {
  const p = post({ chat: { id: -1001908926977, username: 'EN4XC', type: 'channel' }, text: rated('⭐⭐') });
  assert.equal(planChannelPost(cfg({ SIGNAL_SOURCE_MODE: 'bot' }), p, NOW).jobs.length, 0);
});
