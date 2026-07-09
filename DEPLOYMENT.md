# Deploying the ProductClank MCP Connector (boost MVP)

This server is an OAuth 2.1 authorization server + MCP Streamable-HTTP endpoint.
It delegates end-user login to the ProductClank webapp and bills each connected
user's own credits through one **trusted** agent key.

```
Claude ──HTTPS──▶ mcp.productclank.com/mcp ──REST(trusted key + caller_user_id)──▶ api.productclank.com
                        │
                        └─OAuth─▶ app.productclank.com/connect/mcp (login + consent)
```

Tools exposed: `search_products` (read), `check_balance` (read),
`boost_post` (write — spends credits).

---

## 0. Prerequisites (do these once)

### a. Apply the database migration
Run `migrations/0001_mcp_oauth.sql` against the ProductClank **prod** database
(creates `mcp_oauth_clients`, `mcp_login_states`, `mcp_auth_codes`, `mcp_tokens`).

### b. Create the trusted connector agent
Register one agent — this returns a `pck_live_` key you keep as a server secret:

```bash
curl -X POST https://api.productclank.com/api/v1/agents/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Claude Connector","description":"ProductClank MCP server for Claude"}'
```

Then promote it to trusted (see `sql/setup-trusted-agent.sql`) using the returned
`agent.id`:

```sql
update public."Agent"
set trusted = true, rate_limit_daily = 100000
where id = '<agent_id>';
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
   | `PRODUCTCLANK_TRUSTED_KEY` | the `pck_live_` key from step 0b |
   | `SUPABASE_URL` | prod Supabase URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | prod service-role key |
   | `MCP_GRANT_SECRET` | the secret from step 0c |
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
(grant signer) from the `feat/connect-mcp-consent` branch.

---

## 4. Smoke test

**Metadata reachable:**
```bash
curl https://mcp.productclank.com/.well-known/oauth-authorization-server
curl https://mcp.productclank.com/.well-known/oauth-protected-resource
```

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
webapp consent page), then `tools/list` → expect the 3 tools; call
`search_products`.

**In Claude:** Settings → Connectors → Add custom connector →
`https://mcp.productclank.com/mcp` → connect (runs OAuth) → ask Claude to boost a
post. Confirm the campaign appears in the user's **My Campaigns** on the webapp.

---

## Known MVP limitations (tracked follow-ups)
- **Shared rate limit.** The daily campaign cap is per-agent; all users share the
  one trusted agent, hence `rate_limit_daily = 100000`. Per-user limiting needs
  the boost route to rate-limit by `caller_user_id`.
- **Single instance.** MCP transport sessions are in-memory — run one instance.
  OAuth tokens ARE persisted (Supabase), so a redeploy does not sign users out.
- **Supabase login required.** Identity is derived from the Supabase session;
  Privy-wallet-only users must sign in with Google/email to connect.
