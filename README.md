# do-droplet-apps

Migration of the Telegram translation/forwarding bots from a DigitalOcean
Droplet to Cloudflare.

| Path | What |
|---|---|
| `relay-worker/` | **The new Cloudflare Worker** that replaces all six Python bots. Start with its README. |
| `site/` | The link page, as Cloudflare static assets. |
| `running/` | Code copied out of the containers that were running on the Droplet (20 Nov 2026). The source of truth for the old behaviour. |
| `folders/` | Source folders from `/root` on the Droplet, including older and duplicate copies. |

Credentials in `running/` and `folders/` were replaced with `"REDACTED"`.
Telegram `.session` files, `.env` files and zip archives were left out
on purpose (`.gitignore` keeps them out).
