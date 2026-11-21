# fti-relay

One Cloudflare Worker that replaces the six Pyrogram bots on the
DigitalOcean Droplet. It uses a normal Telegram **bot** (not your personal
account) plus Google Cloud Translation.

| Flow (`FLOW_*` switch) | Replaces container(s) | What it does |
|---|---|---|
| `FLOW_SIGNALS` | `bold_faraday`, `goofy_roentgen` (updated_app1)<br>`affectionate_merkle`, `admiring_goldwasser` (updated_app2) | New signal posts in **@EN4XC** (Live Trade / Buy Limit / Buy Stop / Sell Limit / Sell Stop) rated **3★ or more** (`MIN_CONFIDENCE_STARS`) → English + French premium channels always; the other 18 premium channels (translated) when the post has a "Market Chart" link |
| `FLOW_MEDIA_PRIVATE` | `xenodochial_carver` (media_forward_private) | Photo/video/document in the English premium channel → the 19 other premium channels, caption translated |
| `FLOW_MEDIA_PUBLIC` | `brave_greider` (media_forward) | Photo/video/document in **@freemiumtradeideas** → the 19 public `@freemiumtradeideasXX` channels, caption translated |
| `FLOW_FREEMIUM` | `brave_banzai` (freemium) | First text post of the day in each premium channel → forwarded to that language's public channel |

```
@EN4XC ──(web preview, every minute)──┐
your channels ──(bot webhook)─────────┤
                                      ▼
                         Worker: plan one job per channel
                                      │
                        Queue "fti-relay-sends" (retries, honours Telegram rate limits)
                                      │
                 translate (Google) → send (Telegram Bot API) → record in D1
```

D1 records every source post and every send, so a redelivered webhook,
an overlapping cron run or a queue retry can never post twice. The
freemium "once a day" limit lives there too, so restarts don't reset it.

## Behaviour changes from the Droplet bots

- **Translation is line by line, from a cache.** Each sentence is translated once per language and reused, so the same English sentence always gets the same translation.
- **Only signals rated 3★ or higher are forwarded** (`MIN_CONFIDENCE_STARS = "3"`). 1★/2★ and unrated signals are dropped before translation; the logs show them as `signal_filtered`. The old bots forwarded every rating.
- **@EN4XC is read from its public web page** (`https://t.me/s/EN4XC`), as the bot isn't an admin there. New signals appear within about a minute; the old userbot was instant. If the owner adds the bot as an admin (all permissions can be off), set `SIGNAL_SOURCE_MODE = "bot"` for instant delivery.
- **Media without a caption is now forwarded.** The old media bots tried to translate an empty caption, failed, and silently dropped the post.
- **Vietnamese freemium teaser now works.** The old freemium bot had no handler for the `vi` channel.
- **The freemium day boundary is midnight UTC+1** (`FREEMIUM_DAY_UTC_OFFSET_HOURS = "1"`). The old bot's `Etc/GMT+1` actually meant UTC−1. Set `"-1"` to keep the old timing exactly.
- **The Market Chart link is kept by the translator itself**, not patched back with a per-language phrase table, so it can't go missing when Google words the phrase differently.
- **Only one copy runs.** The Droplet ran an old (`googletrans`) and a new (`gtranslate`) copy of both signal bots at once.

## One-time setup

You need Node.js 20+ on your own computer, plus the bot token and Google
key from the earlier steps.

1. **Install and log in**

   ```bash
   cd relay-worker && npm install && npx wrangler login
   ```

2. **Create the database and apply the schema.** Copy the `database_id` the first command prints into `wrangler.toml`.

   ```bash
   npx wrangler d1 create fti_relay
   ```

   ```bash
   npx wrangler d1 migrations apply fti_relay --remote
   ```

3. **Create the queue**

   ```bash
   npx wrangler queues create fti-relay-sends
   ```

4. **Store the secrets.** Each command prompts for the value; nothing is saved in files. For the webhook secret, make up a long random string (letters, digits, `_` and `-` only) and keep it for step 7.

   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   ```

   ```bash
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   ```

   ```bash
   npx wrangler secret put GOOGLE_TRANSLATE_API_KEY
   ```

5. **Make a test channel.** Create a private Telegram channel (e.g. "FTI Relay Test") and add the bot as admin with "Post messages".

6. **Deploy.** Note the `https://fti-relay.<you>.workers.dev` URL it prints.

   ```bash
   npm run deploy
   ```

7. **Point the bot at the Worker.** Run this on your own computer; it asks for the token and secret without echoing them. Use a **new bot**, not the FTI trading bot: a bot with a webhook can no longer use `getUpdates`, which the trading worker relies on.

   ```bash
   read -rsp 'Bot token: ' BOT_TOKEN; echo; read -rsp 'Webhook secret: ' HOOK_SECRET; echo; curl -s "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" -d "url=https://fti-relay.YOUR-SUBDOMAIN.workers.dev/telegram/webhook" -d "secret_token=$HOOK_SECRET" --data-urlencode 'allowed_updates=["channel_post"]'
   ```

   It should reply `{"ok":true,"result":true,...}`.

8. **Find the test channel's id.** Start the log stream, post anything in the test channel, and look for `unrouted_channel_post` with its `chatId` (like `-100…`).

   ```bash
   npx wrangler tail --format pretty
   ```

   Put that id in `TEST_CHAT_ID` in `wrangler.toml` (and optionally `ALERT_CHAT_ID`, which can be the same channel), then redeploy:

   ```bash
   npm run deploy
   ```

9. **Check it's alive.** Open `https://fti-relay.YOUR-SUBDOMAIN.workers.dev/health`. It should show every flow as `"test"`.

## Test phase (recommended: a few days)

All flows start in `test`: everything the Worker would post goes to the
test channel, headed `🧪 TEST <flow> → <language> (<real channel>)`, while
the Droplet keeps running as normal. Compare the test channel with the
real channels:

- each @EN4XC signal → 20 test posts (or 2 without a chart), translations readable, Market Chart link clickable
- media in the English premium channel or @freemiumtradeideas → 19 test posts each
- one freemium teaser per language per day

`npx wrangler tail --format pretty` shows each job (`job_sent`, `job_retry`, `job_failed`).

## Cutover, one flow at a time

For each flow: set it to `"live"` in `wrangler.toml`, run `npm run deploy`,
and **within the same minute** stop its containers on the Droplet so
posts aren't doubled. `--restart=no` stops Docker from restarting them
at the next reboot.

| Flow | Stop on the Droplet |
|---|---|
| `FLOW_MEDIA_PUBLIC` | `docker update --restart=no brave_greider && docker stop brave_greider` |
| `FLOW_MEDIA_PRIVATE` | `docker update --restart=no xenodochial_carver && docker stop xenodochial_carver` |
| `FLOW_SIGNALS` **and** `FLOW_FREEMIUM` together | `docker update --restart=no bold_faraday goofy_roentgen affectionate_merkle admiring_goldwasser brave_banzai && docker stop bold_faraday goofy_roentgen affectionate_merkle admiring_goldwasser brave_banzai` |

Switch signals and freemium together: the old freemium bot reacts to
*any* text post in the premium channels, so it would also forward the
Worker's posts and double the teasers.

**Rollback** for any flow: set it back to `"test"`, redeploy, and
`docker start <names>` on the Droplet.

## After cutover

1. **Link page:** deploy `../site` (see the README there) and move its domain.
2. **Let it run for a week**, then snapshot and destroy the Droplet.
3. **Log out the old sessions.** In Telegram: Settings → Devices, terminate the Pyrogram sessions the Droplet used. Their session files were briefly in a private GitHub repo, so don't skip this.

## Costs

**No new Cloudflare subscription.** The Workers Paid plan is per
account, not per Worker, so deploy into one of your two existing paid
accounts (set `account_id` in `wrangler.toml`). This Worker's usage is
small next to what the plan includes each month:

| Resource | This Worker, per month (approx.) |
|---|---|
| Worker requests | ~45,000 (one cron run a minute, plus webhooks) |
| Queue operations | ~60,000 (each post to a channel is 3 operations) |
| D1 | a few thousand rows written, well under 1 GB stored |

Those figures assume about 20 forwarded signals and a few media posts a
day. They stay far inside the plan's included amounts, unless the other
Workers in that account already use most of them. You can check under
**Workers & Pages → Plans/Usage** in the dashboard.

**Google Translation stays inside the free 500,000 characters/month, guaranteed:**

1. **Line cache.** @EN4XC's signals reuse the same sentences with
   different prices and symbols. Each line is stored with its
   numbers/symbols masked (`We look to Sell at {{0}}`) and translated
   once per language, ever. Replaying two weeks of real @EN4XC history
   (220 signals at 3★+): ~22-55k characters/day in the first week while
   the cache fills, then **~10k/day**, about **226k a month**. Without
   the cache it would be ~4 million a month.
2. **Hard cap in the Worker.** Before every Google call, the Worker
   reserves the request's characters against
   `TRANSLATE_MONTHLY_CHAR_BUDGET` (450,000) in D1, atomically. If a
   call would go over, it isn't made: sentences not yet cached stay in
   English until the next month, and one alert is sent. Cached
   sentences keep translating.
3. **Cap at Google too (belt and braces).** In Google Cloud Console →
   **IAM & Admin → Quotas**, filter for *Cloud Translation API*, select
   *v2 and v3 general model characters per day*, and **Edit quota** to
   `40000`. That allows a busy first week, while 40,000 × 31 days alone
   could exceed 500k, so the Worker's monthly cap stays the real limit.
   Also add a **Billing → Budgets & alerts** budget of $1 to be emailed
   if anything is ever charged.

To see this month's usage:

```bash
npx wrangler d1 execute fti_relay --remote --command "SELECT * FROM translate_usage"
```

If a cached translation is ever wrong, delete it and it is
re-translated on next use, e.g.:

```bash
npx wrangler d1 execute fti_relay --remote --command "DELETE FROM translations WHERE lang = 'fr' AND src LIKE '%Bespoke%'"
```

## Development

```bash
npm test
```

```bash
npm run typecheck
```

The tests run the real SQL against SQLite (D1's engine), with fake
Telegram and translation clients. `tests/fixtures/channel-page.html` is
a synthetic copy of the `t.me/s/` page structure. If Telegram changes
that page and polling logs `web_poll_no_posts`, refresh the fixture from
the live page and fix `src/sources/channel-web.ts`.
