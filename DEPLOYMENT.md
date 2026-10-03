# Deploying the ProductClank MCP Connector (boost MVP)

This server is an OAuth 2.1 authorization server + MCP Streamable-HTTP endpoint.
It delegates end-user login to the ProductClank webapp and bills each connected
user's own credits through their own **per-user** agent (provisioned at consent
via the webapp's `/agents/connector/provision` route — no shared trusted key).

```
Claude ──HTTPS──▶ mcp.productclank.com/mcp ──REST(per-user agent key)──▶ api.productclank.com
                        │
                        └─OAuth─▶ app.productclank.com/connect/mcp (login + consent)
```

Tools exposed: the full tool list (~29 tools, spend and earn) lives in the
[README's Tools table](./README.md#tools).

---

## 0. Prerequisites (do these once)

### a. Apply the database migrations
Run `migrations/0001_mcp_oauth.sql` against the ProductClank **prod** database
(creates `mcp_oauth_clients`, `mcp_login_states`, `mcp_auth_codes`, `mcp_tokens`),
then `migrations/0002_login_state_browser_binding.sql` (adds
`mcp_login_states.browser_nonce_hash`). Apply 0002 **before** deploying a build
that includes it — `/oauth/authorize` writes the column on every login.

### b. Generate the provisioning secret
Per-user agents are provisioned on demand by the webapp's
`POST /api/v1/agents/connector/provision` route; the server authenticates to it
with a shared secret (set the SAME value as `MCP_PROVISION_SECRET` in the
webapp's Vercel env):

```bash
openssl rand -hex 32
```


### c. Generate the shared grant secret
```bash
openssl rand -hex 32
```
This one value goes into **both** the MCP server (`MCP_GRANT_SECRET`) and the
webapp (`MCP_GRANT_SECRET`). They must match.

---

## 1. Deploy to Railway

1. **New Project → Deploy from GitHub repo** → `covariance-network/productclank-mcp-server`.
2. Railway auto-detects Node. Confirm build/start:
   - Build: `npm install && npm run build`
   - Start: `npm run start`
   (Or use the included `Dockerfile` — Railway will pick it up automatically.)
3. **Variables** — add:
   | Variable | Value |
   |---|---|
   | `MCP_SERVER_URL` | `https://mcp.productclank.com` |
   | `OAUTH_ISSUER` | `https://mcp.productclank.com` |
   | `PRODUCTCLANK_API_URL` | `https://api.productclank.com/api/v1` |
   | `PRODUCTCLANK_WEBAPP_URL` | `https://app.productclank.com` |
   | `MCP_PROVISION_SECRET` | shared secret for the webapp's `/agents/connector/provision` route (must match the webapp env; `openssl rand -hex 32`) |
   | `SUPABASE_URL` | prod Supabase URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | prod service-role key |
   | `MCP_GRANT_SECRET` | the secret from step 0c |
   | `POSTHOG_API_KEY` | same project key as the webapp's `NEXT_PUBLIC_POSTHOG_KEY` (optional — unset disables telemetry) |
   > Do **not** set `PORT` — Railway injects it and the server reads it.
4. Deploy. Check the deploy logs for `ProductClank MCP server listening on :<port>`.

## 2. Custom domain + DNS
1. Railway → service → **Settings → Networking → Custom Domain** → add
   `mcp.productclank.com`. Railway shows a CNAME target.
2. In your DNS provider, add a `CNAME` `mcp` → that target. TLS is issued
   automatically. Wait for it to go green.
3. Verify: `curl https://mcp.productclank.com/health` → `{"status":"ok",...}`.

## 3. Configure the webapp
Set these on the ProductClank webapp (Vercel) env and redeploy `main`→`prod`:
- `MCP_GRANT_SECRET` — same value as the MCP server.
- `MCP_ALLOWED_CALLBACK_ORIGINS` — `https://mcp.productclank.com` (optional; this
  is the default).

The webapp ships `/connect/mcp` (consent page) and `/api/connect/mcp/grant`
(grant signer) on `main` (deployed with the regular main→prod flow).

---

## 4. Smoke test

**Metadata reachable — root AND resource-path-suffixed variants:**
```bash
curl https://mcp.productclank.com/.well-known/oauth-authorization-server
curl https://mcp.productclank.com/.well-known/oauth-protected-resource
# ChatGPT's connector fetches the /mcp-suffixed paths — these must 200 too:
curl https://mcp.productclank.com/.well-known/oauth-authorization-server/mcp
curl https://mcp.productclank.com/.well-known/oauth-protected-resource/mcp
# oauth-protected-resource must report:  "resource":"https://mcp.productclank.com/mcp"
# …and the creator endpoint is its own protected resource:
curl https://mcp.productclank.com/.well-known/oauth-protected-resource/creator
# must report:  "resource":"https://mcp.productclank.com/creator"
```

**Both endpoints are live and serve the right tool profile:**
```bash
curl -s https://mcp.productclank.com/health
# → {"status":"ok","version":"…","sessions":N,"sessions_by_profile":{"full":…,"creator":…},…}
```
`tools/list` on `/mcp` must include `boost_post`; on `/creator` it must not
(see "Two endpoints" below).

> **ChatGPT connect:** Settings → Apps & Connectors → Advanced → enable
> **Developer mode**, then add a custom connector with the URL above and OAuth.
> Requires a paid ChatGPT plan (Pro/Plus/Business/Enterprise/Education) on web —
> the free tier has no custom-connector option.

**Unauthenticated /mcp returns a 401 challenge:**
```bash
curl -i -X POST https://mcp.productclank.com/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
# → 401 with header: WWW-Authenticate: Bearer ... resource_metadata="https://mcp.productclank.com/.well-known/oauth-protected-resource"
```

**Full flow via MCP Inspector:**
```bash
npx @modelcontextprotocol/inspector
```
Point it at `https://mcp.productclank.com/mcp`, run the OAuth flow (it opens the
webapp consent page), then `tools/list` → expect the full tool list from the
[README](./README.md#tools) (~29 tools); call `search_products`.

**In Claude:** Settings → Connectors → Add custom connector →
`https://mcp.productclank.com/mcp` → connect (runs OAuth) → ask Claude to boost a
post. Confirm the campaign appears in the user's **My Campaigns** on the webapp.

---

## Release checklist

- Bump the version in `package.json` and `src/config.ts` **and `server.json`** —
  the MCP Registry manifest does not update itself and silently drifts otherwise.
- If you add or remove a tool, decide which **profiles** serve it (see below)
  and record it in `capabilities.json`.
- If the release depends on new app-repo behavior, **deploy the app repo first**;
  tools must degrade gracefully against the older API.

---

## Two endpoints, two tool profiles

The server mounts the same MCP implementation twice (`src/index.ts`
→ `mountMcpEndpoint`), each with its own tool profile and its own in-memory
session map:

| Endpoint | Profile | Served to | `boost_post` |
|---|---|---|---|
| `/mcp` | `full` | Claude, ChatGPT, the MCP registry | yes — unchanged, a live revenue path |
| `/creator` | `creator` | Meta's Muse connector directory (muse.ai/platform) | **no** |

`/creator` is the connector presented as a creator-campaign product: a brand
commissions creators, and creators are paid for original content they publish
from their own accounts. `boost_post` sells `likes` and `repost` — engagement
signals — and accepts Instagram post URLs, and Meta's Spam community standard
bars paying for engagement, so it is excluded there **until Meta approves the
connector**; then it can be added back by dropping the profile check in
`src/tools/index.ts`. The prompts and the `productclank://capabilities` resource
are filtered the same way, so no creator-endpoint text mentions boosts, likes or
reposts.

The boundary is the URL, not the OAuth client, because `tools/list` is
unauthenticated by design (directory health checks introspect it), so a reviewer
can list tools before any client identity exists.

Auth, the idle-session sweep, the JSON-only Accept shim and the OAuth documents
apply identically to both; `/health` reports the per-endpoint session counts in
`sessions_by_profile` (`sessions` stays the total).

## Known MVP limitations (tracked follow-ups)
- ~~Shared rate limit~~ — RESOLVED in v0.8.0: each user has their own agent
  (`rate_limit_daily` 50/day, campaign creates + participation submissions).
- **Single instance.** MCP transport sessions are in-memory (per endpoint) —
  run one instance.
  OAuth tokens ARE persisted (Supabase), so a redeploy does not sign users out.
- **Supabase login required.** Identity is derived from the Supabase session;
  Privy-wallet-only users must sign in with Google/email to connect.
