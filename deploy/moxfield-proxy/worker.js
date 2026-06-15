/*
 * moxfield-proxy — a tiny Cloudflare Worker that lets the static (GitHub Pages)
 * build of the deck map fetch Moxfield decks from the browser.
 *
 * Why this exists: Moxfield's API sits behind Cloudflare and does NOT send
 * CORS headers, so a browser on https://<you>.github.io can't fetch it directly
 * (the CLI can, because Node ignores CORS). This Worker fetches the deck
 * server-side and re-serves it with `Access-Control-Allow-Origin`, so the live
 * "+ Add Moxfield deck" feature keeps working on the published site.
 *
 * Security posture (deliberately narrow — this is NOT a general open proxy):
 *   - Only ever fetches the Moxfield deck endpoint for a validated deck id.
 *     The client supplies just an id (or a moxfield URL we extract the id from);
 *     it can never make the Worker fetch an arbitrary URL.
 *   - GET/OPTIONS only. Moxfield deck data is public + read-only.
 *   - ALLOW_ORIGIN is configurable (default "*"); set it to your Pages origin
 *     in wrangler.toml to lock the proxy to your site.
 */

const MOX_API = "https://api2.moxfield.com/v3/decks/all/";
// Moxfield deck ids are URL-safe base64-ish slugs; accept an id or a full URL.
const ID_RE = /^[A-Za-z0-9_-]{8,}$/;

function extractId(raw) {
  if (!raw) return null;
  const m = String(raw).match(/moxfield\.com\/decks\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  const trimmed = String(raw).trim();
  return ID_RE.test(trimmed) ? trimmed : null;
}

function corsHeaders(origin, extra) {
  return Object.assign({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  }, extra || {});
}

async function handle(request, env) {
  // ALLOW_ORIGIN set as a [vars] entry in wrangler.toml; default to "*".
  const origin = (env && env.ALLOW_ORIGIN) || "*";
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: corsHeaders(origin) });

  const url = new URL(request.url);
  // accept /<id>, /decks/<id>, or ?id=<id|moxfield-url>
  const id = extractId(url.searchParams.get("id") || url.pathname.replace(/^\/(decks\/)?/, ""));
  if (!id) return new Response(JSON.stringify({ error: "Provide a Moxfield deck id or URL." }),
    { status: 400, headers: corsHeaders(origin, { "Content-Type": "application/json" }) });

  const upstream = await fetch(MOX_API + encodeURIComponent(id), {
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
  });
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: corsHeaders(origin, { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" }),
  });
}

// Module-syntax entry (wrangler default).
export default { fetch: (request, env) => handle(request, env) };
