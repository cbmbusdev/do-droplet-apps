// Turns an incoming post into queued jobs — one job per destination
// channel. Pure functions: no I/O, so the routing is easy to test.
//
// Old app → flow:
//   updated_app1 + updated_app2  → signals        (@EN4XC → 20 premium channels)
//   media_forward_private        → media_private  (English premium → 19 premium)
//   media_forward                → media_public   (@freemiumtradeideas → 19 public)
//   freemium                     → freemium       (first text post per day, premium → public)

import {
  ALWAYS_SIGNAL_KEYS,
  ENGLISH,
  LANGUAGES,
  type Config,
  type Flow,
  type MediaKind,
  type SendJob,
  dayKey,
  languageByPremiumChat,
} from './config';
import { buildEnglishHtml, confidenceStars, isSignal, stripBrokerSuffix } from './signals';
import type { TgChannelPost } from './telegram';

function modeOf(cfg: Config, flow: Flow): 'test' | 'live' | null {
  const m = cfg.modes[flow];
  return m === 'off' ? null : m;
}

/** Why a post is not forwarded as a signal, or null if it should be. */
export function signalRejection(cfg: Config, text: string): string | null {
  if (!isSignal(text)) return 'not_a_signal';
  if (cfg.minConfidenceStars > 0) {
    const stars = confidenceStars(text);
    if (stars === null) return 'no_confidence_rating';
    if (stars < cfg.minConfidenceStars) return `confidence_${stars}_below_${cfg.minConfidenceStars}`;
  }
  return null;
}

/**
 * Signal post from @EN4XC (either source path) → premium channels.
 * Only signals rated MIN_CONFIDENCE_STARS or higher are forwarded
 * (checked before any translation, so filtered posts cost nothing).
 * Behaviour kept from the old bots: English and French always get the
 * signal; the other 18 languages only when it carries a chart link
 * (updated_app2 returned early without one).
 */
export function planSignal(
  cfg: Config,
  sourceKey: string,
  text: string,
  link: string | null,
): SendJob[] {
  const mode = modeOf(cfg, 'signals');
  if (!mode || signalRejection(cfg, text) !== null) return [];
  const freemiumOn = cfg.modes.freemium !== 'off';
  return LANGUAGES.filter((l) => link || ALWAYS_SIGNAL_KEYS.has(l.key)).map((l) => ({
    key: `${mode}:sig:${sourceKey}:${l.key}`,
    flow: 'signals' as const,
    mode,
    lang: l.key,
    target: l.premium,
    kind: 'text' as const,
    ...(l.code
      ? { text: stripBrokerSuffix(text), link, translateTo: l.code }
      : { html: buildEnglishHtml(text, link) }),
    ...(freemiumOn ? { freemiumLang: l.key } : {}),
  }));
}

export function mediaOf(post: TgChannelPost): { kind: MediaKind; fileId: string } | null {
  if (post.photo?.length) return { kind: 'photo', fileId: post.photo[post.photo.length - 1].file_id };
  if (post.video) return { kind: 'video', fileId: post.video.file_id };
  if (post.document) return { kind: 'document', fileId: post.document.file_id };
  return null;
}

function planMedia(
  cfg: Config,
  flow: 'media_private' | 'media_public',
  post: TgChannelPost,
): SendJob[] {
  const mode = modeOf(cfg, flow);
  const media = mediaOf(post);
  if (!mode || !media) return [];
  const caption = post.caption ?? '';
  return LANGUAGES.filter((l) => l.code).map((l) => ({
    key: `${mode}:${flow}:${post.chat.id}/${post.message_id}:${l.key}`,
    flow,
    mode,
    lang: l.key,
    target: flow === 'media_private' ? l.premium : l.freemium,
    kind: media.kind,
    fileId: media.fileId,
    caption,
    ...(caption.trim() ? { translateTo: l.code as string } : {}),
  }));
}

/** The daily teaser: forward one premium text post to the language's public channel. */
export function planFreemiumForward(
  cfg: Config,
  langKey: string,
  fromChat: number | string,
  messageId: number,
  nowMs: number,
  forceMode?: 'test' | 'live',
): SendJob | null {
  const mode = forceMode ?? modeOf(cfg, 'freemium');
  const lang = LANGUAGES.find((l) => l.key === langKey);
  if (!mode || !lang) return null;
  return {
    // One per language per day: the queue consumer claims this key
    // atomically, so it doubles as the daily limit.
    key: `${mode}:freemium:${lang.key}:${dayKey(nowMs, cfg.freemiumDayOffsetHours)}`,
    flow: 'freemium',
    mode,
    lang: lang.key,
    target: lang.freemium,
    kind: 'forward',
    fromChat,
    messageId,
  };
}

function isSignalSourceChat(cfg: Config, post: TgChannelPost): boolean {
  if (cfg.signalSourceChatId !== null && post.chat.id === cfg.signalSourceChatId) return true;
  return !!post.chat.username && post.chat.username.toLowerCase() === cfg.signalSourceUsername.toLowerCase();
}

function lastTextLink(post: TgChannelPost): string | null {
  const ents = [...(post.entities ?? []), ...(post.caption_entities ?? [])];
  let url: string | null = null;
  for (const e of ents) if (e.type === 'text_link' && e.url) url = e.url;
  return url;
}

export type PostRoute = 'signal_source' | 'english_premium' | 'premium' | 'public_source' | 'unrouted';

/** Every job a channel post (delivered to the bot by webhook) should produce. */
export function planChannelPost(cfg: Config, post: TgChannelPost, nowMs: number): { route: PostRoute; jobs: SendJob[] } {
  if (isSignalSourceChat(cfg, post)) {
    if (cfg.signalSourceMode !== 'bot') return { route: 'signal_source', jobs: [] };
    const text = post.text ?? post.caption ?? '';
    return { route: 'signal_source', jobs: planSignal(cfg, `${post.chat.id}/${post.message_id}`, text, lastTextLink(post)) };
  }

  if (post.chat.username && post.chat.username.toLowerCase() === cfg.mediaPublicSourceUsername.toLowerCase()) {
    return { route: 'public_source', jobs: planMedia(cfg, 'media_public', post) };
  }

  const lang = languageByPremiumChat(post.chat.id);
  if (!lang) return { route: 'unrouted', jobs: [] };

  const jobs: SendJob[] = [];
  if (lang.key === ENGLISH.key) jobs.push(...planMedia(cfg, 'media_private', post));
  // Text posts made by people in a premium channel count toward the
  // daily teaser too, as they did for the old userbot. (Posts the Worker
  // itself makes trigger the teaser from the queue consumer instead.)
  if (post.text) {
    const fwd = planFreemiumForward(cfg, lang.key, post.chat.id, post.message_id, nowMs);
    if (fwd) jobs.push(fwd);
  }
  return { route: lang.key === ENGLISH.key ? 'english_premium' : 'premium', jobs };
}
