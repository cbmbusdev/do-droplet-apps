// Minimal Telegram Bot API client.

export class TelegramRetryAfter extends Error {
  constructor(public readonly retryAfterSeconds: number, method: string) {
    super(`Telegram ${method}: rate limited, retry after ${retryAfterSeconds}s`);
  }
}

/** A failure that retrying will not fix (bot not admin, chat gone, bad file id...). */
export class TelegramPermanentError extends Error {}

export class TelegramParseError extends TelegramPermanentError {}

interface ApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export interface SentMessage {
  message_id: number;
  chat: { id: number };
}

export class Telegram {
  constructor(private readonly token: string) {}

  async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const resp = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    let data: ApiResponse<T>;
    try {
      data = (await resp.json()) as ApiResponse<T>;
    } catch {
      throw new Error(`Telegram ${method}: HTTP ${resp.status} with non-JSON body`);
    }
    if (data.ok && data.result !== undefined) return data.result;

    const desc = data.description ?? `HTTP ${resp.status}`;
    if (data.error_code === 429) throw new TelegramRetryAfter(data.parameters?.retry_after ?? 5, method);
    if (data.error_code === 400 && /can't parse entities|unsupported start tag|can't find end tag/i.test(desc)) {
      throw new TelegramParseError(`Telegram ${method}: ${desc}`);
    }
    if (data.error_code === 400 || data.error_code === 403) {
      throw new TelegramPermanentError(`Telegram ${method}: ${desc}`);
    }
    throw new Error(`Telegram ${method}: ${desc}`); // 5xx etc. — retryable
  }

  sendHtml(chatId: number | string, html: string): Promise<SentMessage> {
    return this.call('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML' });
  }

  sendPlain(chatId: number | string, text: string): Promise<SentMessage> {
    return this.call('sendMessage', { chat_id: chatId, text });
  }

  sendMedia(
    kind: 'photo' | 'video' | 'document',
    chatId: number | string,
    fileId: string,
    caption?: string,
  ): Promise<SentMessage> {
    const method = { photo: 'sendPhoto', video: 'sendVideo', document: 'sendDocument' }[kind];
    return this.call(method, { chat_id: chatId, [kind]: fileId, ...(caption ? { caption } : {}) });
  }

  forward(toChat: number | string, fromChat: number | string, messageId: number): Promise<SentMessage> {
    return this.call('forwardMessage', { chat_id: toChat, from_chat_id: fromChat, message_id: messageId });
  }
}

// --- Incoming update types (only the fields we use) ---

export interface TgEntity {
  type: string;
  url?: string;
}

export interface TgChannelPost {
  message_id: number;
  chat: { id: number; username?: string; title?: string; type: string };
  text?: string;
  caption?: string;
  entities?: TgEntity[];
  caption_entities?: TgEntity[];
  photo?: Array<{ file_id: string; width: number; height: number }>;
  video?: { file_id: string };
  document?: { file_id: string };
}

export interface TgUpdate {
  update_id: number;
  channel_post?: TgChannelPost;
}
