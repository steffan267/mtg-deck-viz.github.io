# Moxfield CORS proxy (Cloudflare Worker)

The published (GitHub Pages) build of the deck map runs in the browser, where
**Moxfield's API can't be fetched directly** — it sits behind Cloudflare and
sends no CORS headers, so the browser blocks the request. (The CLI is unaffected;
Node ignores CORS.) This ~40-line Worker fetches the deck server-side and
re-serves it with CORS headers, so the live **"+ Add Moxfield deck"** feature
keeps working on the published site.

It is intentionally **not** a general proxy: it only ever fetches the Moxfield
deck endpoint for a validated deck id, accepts GET/OPTIONS only, and serves
public read-only data.

## Deploy (one time)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and
[`wrangler`](https://developers.cloudflare.com/workers/wrangler/) (`npm i -g wrangler`).

```bash
cd deploy/moxfield-proxy
wrangler login
wrangler deploy
```

Wrangler prints the deployed URL, e.g. `https://mtg-moxfield-proxy.<you>.workers.dev`.

Optionally lock it to your site by editing `wrangler.toml`:

```toml
[vars]
ALLOW_ORIGIN = "https://YOURNAME.github.io"
```

…then `wrangler deploy` again.

## Use it

Give the Worker URL to the page build via the `MOXFIELD_PROXY` env var when
publishing (see the repo README → *Publishing to GitHub Pages*). In the GitHub
Action this is the **`MOXFIELD_PROXY` repository variable**:

```
Settings → Secrets and variables → Actions → Variables → New repository variable
  Name:  MOXFIELD_PROXY
  Value: https://mtg-moxfield-proxy.<you>.workers.dev
```

The build bakes that URL into the page. At runtime the page tries Moxfield
directly first, then the proxy, then the `r.jina.ai` reader as a last resort —
so a deck still loads even if one path is down.

## Test it

```bash
# replace with any Moxfield deck id
curl "https://mtg-moxfield-proxy.<you>.workers.dev/NQ8mZv-BAEaKflOhzyXflg" | head -c 200
```

You should get deck JSON back with an `access-control-allow-origin` header.
