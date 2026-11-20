// D1 access. Every write that guards against duplicates is a single
// INSERT OR IGNORE, so the check-and-claim is atomic.

/** Claim a source post. True the first time only. */
export async function claimPost(db: D1Database, key: string, nowMs: number): Promise<boolean> {
  const r = await db
    .prepare('INSERT OR IGNORE INTO processed_posts (key, created_at) VALUES (?1, ?2)')
    .bind(key, nowMs)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

/** How long a claim may sit un-sent before another delivery may take it over (a crashed attempt). */
export const STALE_CLAIM_MS = 2 * 60_000;

/**
 * Claim a send.
 *  'claimed' — go ahead and send.
 *  'done'    — already sent; drop this delivery.
 *  'busy'    — another delivery holds a fresh claim; try again later.
 */
export async function claimSend(db: D1Database, key: string, nowMs: number): Promise<'claimed' | 'done' | 'busy'> {
  const r = await db
    .prepare("INSERT OR IGNORE INTO sends (key, status, created_at) VALUES (?1, 'claimed', ?2)")
    .bind(key, nowMs)
    .run();
  if ((r.meta.changes ?? 0) > 0) return 'claimed';

  // Take over a claim whose holder evidently died mid-send.
  const takeover = await db
    .prepare("UPDATE sends SET created_at = ?2 WHERE key = ?1 AND status = 'claimed' AND created_at < ?3")
    .bind(key, nowMs, nowMs - STALE_CLAIM_MS)
    .run();
  if ((takeover.meta.changes ?? 0) > 0) return 'claimed';

  const status = await db.prepare('SELECT status FROM sends WHERE key = ?1').bind(key).first<string>('status');
  return status === 'sent' ? 'done' : 'busy';
}

export async function markSent(db: D1Database, key: string, chatId: number | string, messageId: number): Promise<void> {
  await db
    .prepare("UPDATE sends SET status = 'sent', chat_id = ?2, message_id = ?3 WHERE key = ?1")
    .bind(key, String(chatId), messageId)
    .run();
}

/** Give a claim back after a failed attempt so the retry can take it. */
export async function releaseSend(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM sends WHERE key = ?1 AND status = 'claimed'").bind(key).run();
}

export async function getKv(db: D1Database, k: string): Promise<string | null> {
  return (await db.prepare('SELECT v FROM kv WHERE k = ?1').bind(k).first<string>('v')) ?? null;
}

export async function setKv(db: D1Database, k: string, v: string): Promise<void> {
  await db
    .prepare('INSERT INTO kv (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .bind(k, v)
    .run();
}

/** Drop bookkeeping older than the retention window. */
export async function pruneOld(db: D1Database, nowMs: number, keepDays = 30): Promise<void> {
  const cutoff = nowMs - keepDays * 86_400_000;
  await db.batch([
    db.prepare('DELETE FROM processed_posts WHERE created_at < ?1').bind(cutoff),
    db.prepare("DELETE FROM sends WHERE created_at < ?1 AND status = 'sent'").bind(cutoff),
  ]);
}
