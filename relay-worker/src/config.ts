// Channel map and runtime configuration.
//
// The chat IDs and usernames below are copied verbatim from the Python
// bots that ran on the DigitalOcean Droplet (see ../running/*), so the
// Worker posts to exactly the same channels they did.

export type Flow = 'signals' | 'media_private' | 'media_public' | 'freemium';
export type FlowMode = 'off' | 'test' | 'live';

export interface Language {
  /** Google Translate target code; null = English, sent untranslated. */
  code: string | null;
  /** Short key used in logs, idempotency keys and the daily freemium limit. */
  key: string;
  /** Private (premium) channel — numeric chat id. */
  premium: number;
  /** Public freemium channel — @username. */
  freemium: string;
}

export const LANGUAGES: readonly Language[] = [
  { key: 'en', code: null, premium: -1001716677263, freemium: '@freemiumtradeideas' },
  { key: 'fr', code: 'fr', premium: -1001727546393, freemium: '@freemiumtradeideasfr' },
  { key: 'zh', code: 'zh-CN', premium: -1001603876871, freemium: '@freemiumtradeideaszh' },
  { key: 'hi', code: 'hi', premium: -1001968374987, freemium: '@freemiumtradeideashi' },
  { key: 'es', code: 'es', premium: -1001967102248, freemium: '@freemiumtradeideases' },
  { key: 'ar', code: 'ar', premium: -1001834832881, freemium: '@freemiumtradeideasar' },
  { key: 'pt', code: 'pt', premium: -1001808225555, freemium: '@freemiumtradeideaspt' },
  { key: 'de', code: 'de', premium: -1001691947406, freemium: '@freemiumtradeideasde' },
  { key: 'id', code: 'id', premium: -1001680767391, freemium: '@freemiumtradeideasid' },
  { key: 'ru', code: 'ru', premium: -1001935574963, freemium: '@freemiumtradeideasru' },
  { key: 'fa', code: 'fa', premium: -1001977282644, freemium: '@freemiumtradeideasfa' },
  { key: 'bn', code: 'bn', premium: -1001907958732, freemium: '@freemiumtradeideasbn' },
  { key: 'ja', code: 'ja', premium: -1001981722418, freemium: '@freemiumtradeideasja' },
  { key: 'tr', code: 'tr', premium: -1001833700983, freemium: '@freemiumtradeideastr' },
  { key: 'vi', code: 'vi', premium: -1001933912583, freemium: '@freemiumtradeideasvi' },
  { key: 'ko', code: 'ko', premium: -1001866826313, freemium: '@freemiumtradeideasko' },
  { key: 'it', code: 'it', premium: -1001868063964, freemium: '@freemiumtradeideasit' },
  { key: 'uk', code: 'uk', premium: -1001919151335, freemium: '@freemiumtradeideasuk' },
  { key: 'th', code: 'th', premium: -1001878897497, freemium: '@freemiumtradeideasth' },
  { key: 'pl', code: 'pl', premium: -1001649301490, freemium: '@freemiumtradeideaspl' },
];

export const ENGLISH = LANGUAGES[0];

/** Languages whose premium channel gets a signal even when it has no chart link (old updated_app1). */
export const ALWAYS_SIGNAL_KEYS = new Set(['en', 'fr']);

export function languageByPremiumChat(chatId: number): Language | undefined {
  return LANGUAGES.find((l) => l.premium === chatId);
}

export interface Env {
  DB: D1Database;
  SEND_QUEUE: Queue<SendJob>;

  // Secrets (wrangler secret put)
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  GOOGLE_TRANSLATE_API_KEY: string;

  // Vars (wrangler.toml)
  FLOW_SIGNALS?: string;
  FLOW_MEDIA_PRIVATE?: string;
  FLOW_MEDIA_PUBLIC?: string;
  FLOW_FREEMIUM?: string;
  TEST_CHAT_ID?: string;
  ALERT_CHAT_ID?: string;
  SIGNAL_SOURCE_MODE?: string;
  SIGNAL_SOURCE_USERNAME?: string;
  SIGNAL_SOURCE_CHAT_ID?: string;
  MEDIA_PUBLIC_SOURCE_USERNAME?: string;
  FREEMIUM_DAY_UTC_OFFSET_HOURS?: string;
  MIN_CONFIDENCE_STARS?: string;
  TRANSLATE_MONTHLY_CHAR_BUDGET?: string;
}

export interface Config {
  modes: Record<Flow, FlowMode>;
  testChatId: number | null;
  alertChatId: number | null;
  signalSourceMode: 'web' | 'bot';
  signalSourceUsername: string;
  signalSourceChatId: number | null;
  mediaPublicSourceUsername: string;
  freemiumDayOffsetHours: number;
  /** Signals rated below this (or unrated) are not forwarded. 0 = forward all. */
  minConfidenceStars: number;
  /** Hard cap on characters sent to Google per billing month. */
  translateMonthlyCharBudget: number;
}

function parseMode(raw: string | undefined): FlowMode {
  const v = (raw ?? 'test').trim().toLowerCase();
  return v === 'live' || v === 'off' ? v : 'test';
}

function parseChatId(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) ? n : null;
}

/** 10% under Google's 500k free characters/month, leaving room for month-boundary timing. */
export const DEFAULT_TRANSLATE_BUDGET = 450_000;

export function loadConfig(env: Env): Config {
  const modes: Record<Flow, FlowMode> = {
    signals: parseMode(env.FLOW_SIGNALS),
    media_private: parseMode(env.FLOW_MEDIA_PRIVATE),
    media_public: parseMode(env.FLOW_MEDIA_PUBLIC),
    freemium: parseMode(env.FLOW_FREEMIUM),
  };
  const testChatId = parseChatId(env.TEST_CHAT_ID);
  // A flow in test mode with nowhere to send its test posts is treated as
  // off, so a missing TEST_CHAT_ID can never leak test traffic anywhere.
  if (testChatId === null) {
    for (const f of Object.keys(modes) as Flow[]) if (modes[f] === 'test') modes[f] = 'off';
  }
  const offset = Number(env.FREEMIUM_DAY_UTC_OFFSET_HOURS ?? '1');
  const minStars = Number(env.MIN_CONFIDENCE_STARS ?? '3');
  const budget = Number(env.TRANSLATE_MONTHLY_CHAR_BUDGET ?? String(DEFAULT_TRANSLATE_BUDGET));
  return {
    modes,
    testChatId,
    alertChatId: parseChatId(env.ALERT_CHAT_ID),
    signalSourceMode: (env.SIGNAL_SOURCE_MODE ?? 'web').trim().toLowerCase() === 'bot' ? 'bot' : 'web',
    signalSourceUsername: (env.SIGNAL_SOURCE_USERNAME ?? 'EN4XC').replace(/^@/, '').trim(),
    signalSourceChatId: parseChatId(env.SIGNAL_SOURCE_CHAT_ID),
    mediaPublicSourceUsername: (env.MEDIA_PUBLIC_SOURCE_USERNAME ?? 'freemiumtradeideas').replace(/^@/, '').trim(),
    freemiumDayOffsetHours: Number.isFinite(offset) ? offset : 1,
    // A typo must not silently open the filter: anything unparseable means 3.
    minConfidenceStars: Number.isFinite(minStars) && minStars >= 0 ? minStars : 3,
    // Unparseable → the safe default, never "unlimited".
    translateMonthlyCharBudget:
      Number.isFinite(budget) && budget >= 0 ? Math.floor(budget) : DEFAULT_TRANSLATE_BUDGET,
  };
}

/** Calendar day (YYYY-MM-DD) in a fixed UTC offset — the freemium "once per day" window. */
export function dayKey(nowMs: number, offsetHours: number): string {
  return new Date(nowMs + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

export type MediaKind = 'photo' | 'video' | 'document';

/** One unit of queued work: a single post to a single channel. */
export interface SendJob {
  /** Idempotency key, unique per (source post, target). Prefixed with the mode. */
  key: string;
  flow: Flow;
  mode: Exclude<FlowMode, 'off'>;
  lang: string;
  /** Real destination; in test mode the consumer redirects to TEST_CHAT_ID. */
  target: number | string;
  kind: 'text' | MediaKind | 'forward';
  /** kind=text, untranslated: ready Telegram-HTML body. */
  html?: string;
  /** kind=text, translated: the English signal text ("xx" already stripped) and its chart link. */
  text?: string;
  link?: string | null;
  /** Media: caption (plain text). */
  caption?: string;
  fileId?: string;
  /** Google Translate target language, or absent to send as-is. */
  translateTo?: string;
  /** kind=forward: message to forward. */
  fromChat?: number | string;
  messageId?: number;
  /** After a successful text post to a premium channel, run the daily freemium teaser for this language. */
  freemiumLang?: string;
}
