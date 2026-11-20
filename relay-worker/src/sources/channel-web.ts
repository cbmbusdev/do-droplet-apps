// Reads a public channel's web preview (https://t.me/s/<username>).
//
// @EN4XC belongs to someone else and our bot is not an admin there, so
// the Bot API never sees its posts. Its public preview page lists the
// latest ~20 posts with full text and links, which is all the signal
// flow needs. Switch SIGNAL_SOURCE_MODE to "bot" if the owner ever adds
// the bot as an admin — that path is instant instead of once a minute.

import { decodeEntities } from '../signals';

export interface WebPost {
  id: number;
  text: string;
  /** URL of the "Market Chart" link, else the last link in the post. */
  link: string | null;
}

const POST_START_RE = /data-post="([^"/]+)\/(\d+)"/g;
const TEXT_RE = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/;
const ANCHOR_RE = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

function htmlFragmentToText(fragment: string): string {
  return decodeEntities(fragment.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
}

export function parseChannelPage(html: string, username: string): WebPost[] {
  const posts: WebPost[] = [];
  const want = username.toLowerCase();
  // Cut the page into one block per post so a media-only post (no text
  // div) can never borrow the next post's text.
  const starts = [...html.matchAll(POST_START_RE)];
  for (let i = 0; i < starts.length; i++) {
    const m = starts[i];
    if (m[1].toLowerCase() !== want) continue;
    const block = html.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : html.length);
    const textMatch = TEXT_RE.exec(block);
    if (!textMatch) continue;
    const body = textMatch[1];
    let chart: string | null = null;
    let last: string | null = null;
    for (const a of body.matchAll(ANCHOR_RE)) {
      const href = decodeEntities(a[1]);
      if (!/^https?:\/\//i.test(href)) continue;
      last = href;
      if (htmlFragmentToText(a[2]).trim().toLowerCase() === 'market chart') chart = href;
    }
    posts.push({ id: Number(m[2]), text: htmlFragmentToText(body).trim(), link: chart ?? last });
  }
  // A post can appear twice if the page is re-rendered mid-fetch; keep one, oldest first.
  const byId = new Map(posts.map((p) => [p.id, p]));
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export async function fetchChannelPage(username: string): Promise<string> {
  const resp = await fetch(`https://t.me/s/${encodeURIComponent(username)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; fti-relay/1.0)' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`t.me/s/${username} returned HTTP ${resp.status}`);
  return resp.text();
}
