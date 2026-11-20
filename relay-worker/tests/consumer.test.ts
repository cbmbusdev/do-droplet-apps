import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { type Env, type SendJob, loadConfig } from '../src/config';
import { type Deps, processJob } from '../src/consumer';
import { STALE_CLAIM_MS } from '../src/db';
import { translateLines } from '../src/translation';
import worker, { handleWebhook, pollSignalWeb } from '../src/index';
import { planSignal } from '../src/planner';
import { Telegram, TelegramParseError, TelegramPermanentError, TelegramRetryAfter } from '../src/telegram';
import { sqliteD1 } from './helpers/sqlite-d1';

const schema = ['0001_init.sql', '0002_translation_cache.sql']
  .map((f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'))
  .join('\n');

function freshDb() {
  const h = sqliteD1();
  h.sqlite.exec(schema);
  return h;
}

interface Call {
  method: string;
  chat: number | string;
  body: string;
}

/** A Telegram stand-in that records calls and can be told to fail. */
class FakeTelegram extends Telegram {
  calls: Call[] = [];
  failNext: Error[] = [];
  private nextId = 1000;
  constructor() {
    super('test-token');
  }
  private record(method: string, chat: number | string, body: string) {
    const err = this.failNext.shift();
    if (err) return Promise.reject(err);
    this.calls.push({ method, chat, body });
    return Promise.resolve({ message_id: this.nextId++, chat: { id: typeof chat === 'number' ? chat : -42 } });
  }
  sendHtml(chat: number | string, html: string) {
    return this.record('sendHtml', chat, html);
  }
  sendPlain(chat: number | string, text: string) {
    return this.record('sendPlain', chat, text);
  }
  sendMedia(kind: 'photo' | 'video' | 'document', chat: number | string, fileId: string, caption?: string) {
    return this.record(`send_${kind}`, chat, `${fileId}|${caption ?? ''}`);
  }
  forward(to: number | string, from: number | string, id: number) {
    return this.record('forward', to, `${from}/${id}`);
  }
}

function setup(vars: Partial<Env> = {}) {
  const { db } = freshDb();
  const tg = new FakeTelegram();
  const queued: SendJob[] = [];
  let now = Date.parse('2026-11-20T12:00:00Z');
  const google = { calls: 0, chars: 0 };
  const deps: Deps = {
    tg,
    db,
    translateLines: (lines, target) =>
      translateLines(
        {
          db,
          budget: 450_000,
          now: () => now,
          google: async (texts, lang) => {
            google.calls += 1;
            google.chars += texts.join('').length;
            return texts.map((t) => `[${lang}] ${t}`);
          },
        },
        lines,
        target,
      ),
    enqueue: async (j) => {
      queued.push(j);
    },
    now: () => now,
  };
  const cfg = loadConfig({
    TEST_CHAT_ID: '-100999',
    FLOW_SIGNALS: 'live',
    FLOW_MEDIA_PRIVATE: 'live',
    FLOW_MEDIA_PUBLIC: 'live',
    FLOW_FREEMIUM: 'live',
    ...vars,
  } as Env);
  return { db, tg, queued, deps, cfg, google, advance: (ms: number) => (now += ms) };
}

const SIGNAL = '📉 [Sell Limit] GBPUSDxx - Bearish\nConfidence: ⭐⭐⭐\nMarket Chart';
const signalJob = (cfg: ReturnType<typeof loadConfig>, lang: string) =>
  planSignal(cfg, 'EN4XC/1', SIGNAL, 'https://c.example/a.png').find((j) => j.lang === lang)!;

test('a live translated signal is sent to the real premium channel', async () => {
  const s = setup();
  const out = await processJob(s.deps, s.cfg, signalJob(s.cfg, 'fr'), 1);
  assert.equal(out.kind, 'sent');
  assert.equal(s.tg.calls[0].chat, -1001727546393);
  assert.equal(
    s.tg.calls[0].body,
    '📉 [fr] [Sell Limit] GBPUSD - Bearish\n[fr] Confidence: ⭐⭐⭐\n<a href="https://c.example/a.png">[fr] Market Chart</a>',
  );
});

test('test mode redirects to TEST_CHAT_ID with a banner naming the real target', async () => {
  const s = setup({ FLOW_SIGNALS: 'test' });
  await processJob(s.deps, s.cfg, signalJob(s.cfg, 'en'), 1);
  assert.equal(s.tg.calls[0].chat, -100999);
  assert.ok(s.tg.calls[0].body.startsWith('<i>🧪 TEST signals → en (-1001716677263)</i>\n\n'));
});

test('a job delivered twice posts once', async () => {
  const s = setup();
  const job = signalJob(s.cfg, 'en');
  assert.equal((await processJob(s.deps, s.cfg, job, 1)).kind, 'sent');
  assert.deepEqual(await processJob(s.deps, s.cfg, job, 1), { kind: 'skipped', reason: 'already sent' });
  assert.equal(s.tg.calls.length, 1);
});

test('Telegram rate limits are retried after retry_after, and the claim is released', async () => {
  const s = setup();
  const job = signalJob(s.cfg, 'en');
  s.tg.failNext.push(new TelegramRetryAfter(7, 'sendMessage'));
  const first = await processJob(s.deps, s.cfg, job, 1);
  assert.deepEqual(first.kind === 'retry' && first.delaySeconds, 8);
  assert.equal((await processJob(s.deps, s.cfg, job, 2)).kind, 'sent');
});

test('permanent Telegram errors fail without retry', async () => {
  const s = setup();
  s.tg.failNext.push(new TelegramPermanentError('Telegram sendMessage: Forbidden: bot is not a member'));
  assert.equal((await processJob(s.deps, s.cfg, signalJob(s.cfg, 'en'), 1)).kind, 'failed');
});

test('markup Telegram rejects is re-sent as plain text', async () => {
  const s = setup();
  s.tg.failNext.push(new TelegramParseError("can't parse entities"));
  assert.equal((await processJob(s.deps, s.cfg, signalJob(s.cfg, 'de'), 1)).kind, 'sent');
  assert.equal(s.tg.calls[0].method, 'sendPlain');
  assert.ok(!s.tg.calls[0].body.includes('<a '));
});

test('a fresh claim held by another delivery is retried later; a stale one is taken over', async () => {
  const s = setup();
  const job = signalJob(s.cfg, 'en');
  await s.db.prepare("INSERT INTO sends (key, status, created_at) VALUES (?1, 'claimed', ?2)").bind(job.key, s.deps.now()).run();
  assert.equal((await processJob(s.deps, s.cfg, job, 1)).kind, 'retry');
  s.advance(STALE_CLAIM_MS + 1);
  assert.equal((await processJob(s.deps, s.cfg, job, 2)).kind, 'sent');
});

test('the first premium post of the day queues one freemium forward; the day limit holds', async () => {
  const s = setup();
  await processJob(s.deps, s.cfg, signalJob(s.cfg, 'es'), 1);
  assert.equal(s.queued.length, 1);
  const fwd = s.queued[0];
  assert.deepEqual(
    { kind: fwd.kind, target: fwd.target, fromChat: fwd.fromChat, key: fwd.key },
    { kind: 'forward', target: '@freemiumtradeideases', fromChat: -1001967102248, key: 'live:freemium:es:2026-11-20' },
  );
  assert.equal((await processJob(s.deps, s.cfg, fwd, 1)).kind, 'sent');

  // A second signal the same day asks again, but the forward key is already used.
  const second = planSignal(s.cfg, 'EN4XC/2', SIGNAL, 'https://c').find((j) => j.lang === 'es')!;
  await processJob(s.deps, s.cfg, second, 1);
  assert.equal((await processJob(s.deps, s.cfg, s.queued[1], 1)).kind, 'skipped');
  assert.equal(s.tg.calls.filter((c) => c.method === 'forward').length, 1);

  // Next day it goes through again.
  s.advance(24 * 3_600_000);
  const third = planSignal(s.cfg, 'EN4XC/3', SIGNAL, 'https://c').find((j) => j.lang === 'es')!;
  await processJob(s.deps, s.cfg, third, 1);
  assert.equal((await processJob(s.deps, s.cfg, s.queued[2], 1)).kind, 'sent');
});

test('a test-mode signal can only produce a test-mode teaser', async () => {
  const s = setup({ FLOW_SIGNALS: 'test', FLOW_FREEMIUM: 'live' });
  await processJob(s.deps, s.cfg, signalJob(s.cfg, 'en'), 1);
  assert.equal(s.queued[0].mode, 'test');
  await processJob(s.deps, s.cfg, s.queued[0], 1);
  assert.equal(s.tg.calls.at(-2)!.chat, -100999); // the forward
});

test('a job queued as live obeys a later switch back to test', async () => {
  const live = setup();
  const job = signalJob(live.cfg, 'en');
  const s = setup({ FLOW_SIGNALS: 'test' });
  await processJob(s.deps, s.cfg, job, 1);
  assert.equal(s.tg.calls[0].chat, -100999);
});

test('media captions are translated; empty captions are sent without one', async () => {
  const s = setup();
  const base = { flow: 'media_public' as const, mode: 'live' as const, lang: 'ja', target: '@freemiumtradeideasja', fileId: 'F' };
  await processJob(s.deps, s.cfg, { ...base, key: 'a', kind: 'photo', caption: 'Hello', translateTo: 'ja' }, 1);
  await processJob(s.deps, s.cfg, { ...base, key: 'b', kind: 'video', caption: '' }, 1);
  assert.deepEqual(s.tg.calls.map((c) => [c.method, c.body]), [
    ['send_photo', 'F|[ja] Hello'],
    ['send_video', 'F|'],
  ]);
});

// ---- Worker entry points ----

const page = readFileSync(new URL('./fixtures/channel-page.html', import.meta.url), 'utf8');

function workerEnv(vars: Partial<Env> = {}) {
  const { db } = freshDb();
  const batches: SendJob[][] = [];
  const env = {
    DB: db,
    SEND_QUEUE: {
      send: async (body: SendJob) => void batches.push([body]),
      sendBatch: async (msgs: Array<{ body: SendJob }>) => void batches.push(msgs.map((m) => m.body)),
    },
    TELEGRAM_BOT_TOKEN: 't',
    TELEGRAM_WEBHOOK_SECRET: 'sekret',
    GOOGLE_TRANSLATE_API_KEY: 'k',
    TEST_CHAT_ID: '-100999',
    ...vars,
  } as unknown as Env;
  return { env, batches, db };
}

test('web polling starts from the newest post, then queues each new signal once', async () => {
  const { env, batches, db } = workerEnv();
  const older = page.replace('data-post="EN4XC/102"', 'data-post="EN4XC/99"');
  assert.equal(await pollSignalWeb(env, older), 0); // first run: just records where we are
  assert.equal(batches.length, 0);

  assert.equal(await pollSignalWeb(env, page), 1); // 102 is new and a signal; 100 is not a signal
  assert.equal(batches.flat().length, 20);
  assert.ok(batches.flat().every((j) => j.mode === 'test'));

  assert.equal(await pollSignalWeb(env, page), 0); // nothing new
  assert.equal(await db.prepare('SELECT v FROM kv').first('v'), '102');
});

test('a post whose jobs fail to queue is picked up again on the next poll', async () => {
  const { env, batches } = workerEnv();
  await pollSignalWeb(env, page.replace('data-post="EN4XC/102"', 'data-post="EN4XC/99"'));
  const realBatch = env.SEND_QUEUE.sendBatch;
  (env.SEND_QUEUE as { sendBatch: unknown }).sendBatch = async () => {
    throw new Error('queue down');
  };
  await assert.rejects(pollSignalWeb(env, page));
  (env.SEND_QUEUE as { sendBatch: unknown }).sendBatch = realBatch;
  assert.equal(await pollSignalWeb(env, page), 1);
  assert.equal(batches.flat().length, 20);
});

const update = (chatId: number, messageId: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ update_id: 1, channel_post: { message_id: messageId, chat: { id: chatId, type: 'channel' }, ...extra } });

const webhookRequest = (body: string, secret = 'sekret') =>
  new Request('https://relay.example/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
    body,
  });

test('the webhook rejects requests without the secret', async () => {
  const { env } = workerEnv();
  assert.equal((await handleWebhook(webhookRequest(update(-1001716677263, 1), 'wrong'), env)).status, 403);
});

test('the webhook queues media jobs once per post, even if Telegram redelivers', async () => {
  const { env, batches } = workerEnv();
  const body = update(-1001716677263, 5, { photo: [{ file_id: 'p', width: 1, height: 1 }], caption: 'Chart' });
  assert.equal((await handleWebhook(webhookRequest(body), env)).status, 200);
  assert.equal((await handleWebhook(webhookRequest(body), env)).status, 200);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 19);
});

test('/health reports the flow modes', async () => {
  const { env } = workerEnv({ FLOW_SIGNALS: 'live' });
  const r = await worker.fetch(new Request('https://relay.example/health'), env);
  const body = (await r.json()) as { modes: Record<string, string> };
  assert.equal(body.modes.signals, 'live');
  assert.equal(body.modes.freemium, 'test');
});

test('web polling skips a 2-star signal but still moves past it', async () => {
  const { env, batches, db } = workerEnv();
  await pollSignalWeb(env, page.replace('data-post="EN4XC/102"', 'data-post="EN4XC/99"'));
  const twoStar = page.replace('<i class="emoji"><b>⭐</b></i><i class="emoji"><b>⭐</b></i><i class="emoji"><b>⭐</b></i>', '<i class="emoji"><b>⭐</b></i><i class="emoji"><b>⭐</b></i>');
  assert.notEqual(twoStar, page);
  assert.equal(await pollSignalWeb(env, twoStar), 0);
  assert.equal(batches.length, 0);
  assert.equal(await db.prepare('SELECT v FROM kv').first('v'), '102');
});

test('the second signal with the same wording costs no Google characters', async () => {
  const s = setup();
  await processJob(s.deps, s.cfg, signalJob(s.cfg, 'de'), 1);
  const charsAfterFirst = s.google.chars;
  assert.ok(charsAfterFirst > 0);
  // Same lines, different symbol, price and rating -> fully cached.
  const other = planSignal(s.cfg, 'EN4XC/9', '📈 [Sell Limit] EURJPYxx - Bearish\nConfidence: ⭐⭐⭐⭐\nMarket Chart', 'https://c.example/b.png')
    .find((j) => j.lang === 'de')!;
  await processJob(s.deps, s.cfg, other, 1);
  assert.equal(s.google.chars, charsAfterFirst);
  assert.equal(
    s.tg.calls[1].body,
    '📈 [de] [Sell Limit] EURJPY - Bearish\n[de] Confidence: ⭐⭐⭐⭐\n<a href="https://c.example/b.png">[de] Market Chart</a>',
  );
});
