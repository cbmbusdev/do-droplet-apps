// fti-relay: replaces the six Pyrogram bots that ran on the DigitalOcean Droplet.
//
//   fetch     — Telegram webhook (channel posts in channels where the bot is admin)
//   scheduled — every minute: read @EN4XC's public web preview; daily cleanup
//   queue     — deliver one post to one channel, with retries

import { type Env, type SendJob, loadConfig } from './config';
import { handleQueueBatch } from './consumer';
import { claimPost, getKv, pruneOld, setKv } from './db';
import { log } from './log';
import { planChannelPost, planSignal } from './planner';
import { fetchChannelPage, parseChannelPage } from './sources/channel-web';
import type { TgUpdate } from './telegram';

const QUEUE_BATCH_LIMIT = 100;

async function enqueueAll(env: Env, jobs: SendJob[]): Promise<void> {
  for (let i = 0; i < jobs.length; i += QUEUE_BATCH_LIMIT) {
    await env.SEND_QUEUE.sendBatch(jobs.slice(i, i + QUEUE_BATCH_LIMIT).map((body) => ({ body })));
  }
}

/**
 * Claim a source post, then queue its jobs. Returns false for a post
 * already handled. If queueing fails the claim is given back and the
 * error rethrown, so the next attempt (Telegram redelivery or the next
 * cron run) picks the post up again. Jobs are idempotent per key, so a
 * partly-queued post re-queued later still can't double-post.
 */
async function claimAndEnqueue(env: Env, postKey: string, jobs: SendJob[], nowMs: number): Promise<boolean> {
  if (!(await claimPost(env.DB, postKey, nowMs))) return false;
  try {
    await enqueueAll(env, jobs);
  } catch (err) {
    await env.DB.prepare('DELETE FROM processed_posts WHERE key = ?1').bind(postKey).run();
    throw err;
  }
  return true;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
  if (!env.TELEGRAM_WEBHOOK_SECRET || !timingSafeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response('forbidden', { status: 403 });
  }
  const update = (await request.json().catch(() => null)) as TgUpdate | null;
  const post = update?.channel_post;
  if (!post) return new Response('ok');

  const cfg = loadConfig(env);
  const now = Date.now();
  const { route, jobs } = planChannelPost(cfg, post, now);
  if (route === 'unrouted') {
    // Logged so you can find a new channel's numeric id (e.g. TEST_CHAT_ID) in the logs.
    log('info', 'unrouted_channel_post', { chatId: post.chat.id, title: post.chat.title, username: post.chat.username });
    return new Response('ok');
  }
  if (jobs.length === 0) return new Response('ok');

  try {
    if (!(await claimAndEnqueue(env, `tg:${post.chat.id}/${post.message_id}`, jobs, now))) {
      log('info', 'duplicate_update', { chatId: post.chat.id, messageId: post.message_id });
      return new Response('ok');
    }
  } catch (err) {
    // A non-2xx makes Telegram redeliver the update later.
    log('error', 'enqueue_failed', { route, chatId: post.chat.id, messageId: post.message_id, error: String(err) });
    return new Response('retry', { status: 500 });
  }
  log('info', 'channel_post_routed', { route, chatId: post.chat.id, messageId: post.message_id, jobs: jobs.length });
  return new Response('ok');
}

const LAST_WEB_POST_KEY = (u: string) => `web_last_post:${u.toLowerCase()}`;

/** Poll the signal source's public web preview and queue any new signals. */
export async function pollSignalWeb(env: Env, html?: string): Promise<number> {
  const cfg = loadConfig(env);
  if (cfg.signalSourceMode !== 'web' || cfg.modes.signals === 'off') return 0;
  const username = cfg.signalSourceUsername;
  const posts = parseChannelPage(html ?? (await fetchChannelPage(username)), username);
  if (posts.length === 0) {
    log('warn', 'web_poll_no_posts', { username });
    return 0;
  }
  const newest = posts[posts.length - 1].id;
  const lastRaw = await getKv(env.DB, LAST_WEB_POST_KEY(username));
  if (lastRaw === null) {
    // First run: start from now instead of replaying the page's history.
    await setKv(env.DB, LAST_WEB_POST_KEY(username), String(newest));
    log('info', 'web_poll_initialised', { username, lastPostId: newest });
    return 0;
  }
  const last = Number(lastRaw);
  let queued = 0;
  const now = Date.now();
  for (const p of posts.filter((x) => x.id > last)) {
    const sourceKey = `${username}/${p.id}`;
    const jobs = planSignal(cfg, sourceKey, p.text, p.link);
    // Throws (leaving the cursor before this post) if queueing fails.
    if (jobs.length > 0 && (await claimAndEnqueue(env, `web:${sourceKey}`, jobs, now))) {
      queued += 1;
      log('info', 'signal_queued', { source: sourceKey, jobs: jobs.length, hasChart: !!p.link });
    }
    // Advance after each post so a failure part-way doesn't replay earlier ones.
    await setKv(env.DB, LAST_WEB_POST_KEY(username), String(p.id));
  }
  return queued;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/telegram/webhook') return handleWebhook(request, env);
    if (url.pathname === '/health') {
      const cfg = loadConfig(env);
      return Response.json({ ok: true, modes: cfg.modes, signalSource: cfg.signalSourceMode });
    }
    return new Response('not found', { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    try {
      await pollSignalWeb(env);
    } catch (err) {
      log('error', 'web_poll_failed', { error: String(err) });
    }
    const t = new Date(controller.scheduledTime);
    if (t.getUTCHours() === 3 && t.getUTCMinutes() === 17) {
      try {
        await pruneOld(env.DB, Date.now());
      } catch (err) {
        log('error', 'prune_failed', { error: String(err) });
      }
    }
  },

  async queue(batch: MessageBatch<SendJob>, env: Env): Promise<void> {
    await handleQueueBatch(batch, env);
  },
} satisfies ExportedHandler<Env, SendJob>;
