// Queue consumer: one SendJob = one post to one channel.

import { type Config, type Env, type SendJob, loadConfig } from './config';
import { claimSend, markSent, releaseSend } from './db';
import { log } from './log';
import { planFreemiumForward } from './planner';
import { buildTranslatedHtml, escapeHtml, htmlToPlain } from './signals';
import {
  type SentMessage,
  Telegram,
  TelegramParseError,
  TelegramPermanentError,
  TelegramRetryAfter,
} from './telegram';
import { googleTranslateBatch } from './translate';
import { type LinesResult, translateLines } from './translation';

const CAPTION_LIMIT = 1024;
const TEXT_LIMIT = 4096;
export const MAX_ATTEMPTS = 6;

export type Outcome =
  | { kind: 'sent'; chatId: number | string; messageId: number }
  | { kind: 'skipped'; reason: string }
  | { kind: 'retry'; delaySeconds: number; reason: string }
  | { kind: 'failed'; reason: string };

export interface Deps {
  tg: Telegram;
  /** Line-cached, budget-capped translation (see translation.ts). */
  translateLines: (lines: string[], target: string) => Promise<LinesResult>;
  db: D1Database;
  enqueue: (job: SendJob) => Promise<void>;
  now: () => number;
}

function testBanner(job: SendJob): string {
  return `🧪 TEST ${job.flow} → ${job.lang} (${job.target})`;
}

async function deliver(deps: Deps, cfg: Config, job: SendJob): Promise<SentMessage> {
  const redirect = job.mode === 'test';
  const chat = redirect ? (cfg.testChatId as number) : job.target;

  if (job.kind === 'forward') {
    const msg = await deps.tg.forward(chat, job.fromChat as number | string, job.messageId as number);
    if (redirect) await deps.tg.sendPlain(chat, `${testBanner(job)} — the forward above`);
    return msg;
  }

  if (job.kind === 'text') {
    let html = job.html ?? '';
    if (job.translateTo) {
      const english = (job.text ?? '').split('\n');
      const { lines } = await deps.translateLines(english, job.translateTo);
      html = buildTranslatedHtml(english, lines, job.link ?? null);
    }
    if (redirect) html = `<i>${escapeHtml(testBanner(job))}</i>\n\n${html}`;
    try {
      return await deps.tg.sendHtml(chat, html.slice(0, TEXT_LIMIT));
    } catch (err) {
      // Translation produced markup Telegram rejects: post it as plain
      // text rather than lose the signal.
      if (err instanceof TelegramParseError) return deps.tg.sendPlain(chat, htmlToPlain(html).slice(0, TEXT_LIMIT));
      throw err;
    }
  }

  let caption = job.caption ?? '';
  if (job.translateTo && caption.trim()) {
    caption = (await deps.translateLines(caption.split('\n'), job.translateTo)).lines.join('\n');
  }
  if (redirect) caption = `${testBanner(job)}\n\n${caption}`;
  return deps.tg.sendMedia(job.kind, chat, job.fileId as string, caption.slice(0, CAPTION_LIMIT) || undefined);
}

export async function processJob(deps: Deps, cfg: Config, queued: SendJob, attempt: number): Promise<Outcome> {
  // The config wins over what was true at enqueue time: a job queued
  // while a flow was live goes to the test chat if the flow has since
  // been switched back to test (key unchanged, so it still can't double-post).
  const job: SendJob = queued.mode === 'live' && cfg.modes[queued.flow] === 'test' ? { ...queued, mode: 'test' } : queued;
  if (cfg.modes[job.flow] === 'off') return { kind: 'skipped', reason: `flow ${job.flow} is off` };
  if (job.mode === 'test' && cfg.testChatId === null) return { kind: 'skipped', reason: 'no TEST_CHAT_ID' };

  const claim = await claimSend(deps.db, job.key, deps.now());
  if (claim === 'done') return { kind: 'skipped', reason: 'already sent' };
  if (claim === 'busy') return { kind: 'retry', delaySeconds: 60, reason: 'claimed by another delivery' };

  let sent: SentMessage;
  try {
    sent = await deliver(deps, cfg, job);
  } catch (err) {
    await releaseSend(deps.db, job.key);
    if (err instanceof TelegramRetryAfter) {
      return { kind: 'retry', delaySeconds: err.retryAfterSeconds + 1, reason: err.message };
    }
    if (err instanceof TelegramPermanentError || attempt >= MAX_ATTEMPTS) {
      return { kind: 'failed', reason: String(err instanceof Error ? err.message : err) };
    }
    return { kind: 'retry', delaySeconds: Math.min(300, 10 * 2 ** attempt), reason: String(err) };
  }
  await markSent(deps.db, job.key, sent.chat.id, sent.message_id);

  // The daily freemium teaser for posts the Worker itself made (a bot
  // gets no update for its own channel posts, so the webhook can't see them).
  if (job.freemiumLang && job.kind === 'text') {
    // Teaser follows the post it forwards: a test post may only produce a test teaser.
    const teaserMode = cfg.modes.freemium === 'off' ? null : job.mode === 'test' ? 'test' : cfg.modes.freemium;
    const fwd = teaserMode
      ? planFreemiumForward(cfg, job.freemiumLang, sent.chat.id, sent.message_id, deps.now(), teaserMode)
      : null;
    if (fwd) {
      try {
        await deps.enqueue(fwd);
      } catch (err) {
        log('error', 'freemium_enqueue_failed', { key: fwd.key, error: String(err) });
      }
    }
  }
  return { kind: 'sent', chatId: sent.chat.id, messageId: sent.message_id };
}

async function alert(env: Env, cfg: Config, text: string): Promise<void> {
  if (cfg.alertChatId === null) return;
  try {
    await new Telegram(env.TELEGRAM_BOT_TOKEN).sendPlain(cfg.alertChatId, `⚠️ fti-relay: ${text}`.slice(0, TEXT_LIMIT));
  } catch (err) {
    log('error', 'alert_send_failed', { error: String(err) });
  }
}

export async function handleQueueBatch(batch: MessageBatch<SendJob>, env: Env): Promise<void> {
  const cfg = loadConfig(env);
  const deps: Deps = {
    tg: new Telegram(env.TELEGRAM_BOT_TOKEN),
    translateLines: (lines, target) =>
      translateLines(
        {
          db: env.DB,
          google: (texts, lang) => googleTranslateBatch(env.GOOGLE_TRANSLATE_API_KEY, texts, lang),
          budget: cfg.translateMonthlyCharBudget,
          now: () => Date.now(),
          onBudgetExhausted: async (month, lang, lines) => {
            log('warn', 'translate_budget_exhausted', { month, lang, lines, budget: cfg.translateMonthlyCharBudget });
            // One alert per month, not one per post.
            const first = await env.DB.prepare('INSERT OR IGNORE INTO kv (k, v) VALUES (?1, ?2)')
              .bind(`budget_alert:${month}`, String(Date.now()))
              .run();
            if ((first.meta.changes ?? 0) > 0) {
              await alert(
                env,
                cfg,
                `Google translation budget for ${month} (${cfg.translateMonthlyCharBudget} chars) is used up. ` +
                  'Lines not yet in the translation cache will stay in English until next month.',
              );
            }
          },
        },
        lines,
        target,
      ),
    db: env.DB,
    enqueue: async (job) => {
      await env.SEND_QUEUE.send(job);
    },
    now: () => Date.now(),
  };

  for (const msg of batch.messages) {
    const job = msg.body;
    let outcome: Outcome;
    try {
      outcome = await processJob(deps, cfg, job, msg.attempts);
    } catch (err) {
      // D1 or other infrastructure failure — let the queue retry.
      outcome = { kind: 'retry', delaySeconds: 30, reason: String(err) };
    }
    const ctx = { key: job.key, flow: job.flow, lang: job.lang, attempt: msg.attempts };
    switch (outcome.kind) {
      case 'sent':
        log('info', 'job_sent', { ...ctx, chatId: outcome.chatId, messageId: outcome.messageId });
        msg.ack();
        break;
      case 'skipped':
        log('info', 'job_skipped', { ...ctx, reason: outcome.reason });
        msg.ack();
        break;
      case 'retry':
        if (msg.attempts >= MAX_ATTEMPTS) {
          log('error', 'job_gave_up', { ...ctx, reason: outcome.reason });
          await alert(env, cfg, `gave up on ${job.flow}/${job.lang} after ${msg.attempts} attempts: ${outcome.reason}`);
          msg.ack();
        } else {
          log('warn', 'job_retry', { ...ctx, delaySeconds: outcome.delaySeconds, reason: outcome.reason });
          msg.retry({ delaySeconds: outcome.delaySeconds });
        }
        break;
      case 'failed':
        log('error', 'job_failed', { ...ctx, reason: outcome.reason });
        await alert(env, cfg, `${job.flow}/${job.lang} → ${job.target} failed: ${outcome.reason}`);
        msg.ack();
        break;
    }
  }
}
