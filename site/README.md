# fti-linktree

The "Freemium Trade Ideas" link page, copied unchanged from the Droplet's
`linktree` container (`public/`), served as static files by Cloudflare.

1. Deploy (from `relay-worker/`, which has wrangler installed):

   ```bash
   npx wrangler deploy -c ../site/wrangler.toml
   ```

   It prints a `https://fti-linktree.<you>.workers.dev` preview URL.

2. Find which domain the Droplet serves it on: open `http://188.166.224.210:81`
   (nginx-proxy-manager) → **Hosts → Proxy Hosts**, and look for the host
   forwarding to the `linktree` container.

3. Uncomment `routes` in `wrangler.toml` with that hostname and deploy again.
   The domain's DNS zone must be on Cloudflare. Cloudflare issues the
   certificate, so nginx-proxy-manager is no longer needed for it.

To edit the page, change the files in `public/` and redeploy.
