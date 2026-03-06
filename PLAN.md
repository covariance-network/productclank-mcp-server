# ProductClank MCP Server — Implementation Plan

## Goal
Enable anyone to add ProductClank as a custom connector in Claude, so Claude can natively create Communiply campaigns, boost tweets, and manage credits.

## Current State (this branch: `mcp-server`)

### What's Built
- MCP server skeleton using `@modelcontextprotocol/sdk` with Streamable HTTP transport
- 9 MCP tools wrapping the existing REST API:
  - `search_products` — Find products by name
  - `create_campaign` — Create Communiply campaign (10 credits)
  - `generate_posts` — Trigger discovery & reply generation (12 credits/post)
  - `get_campaign` — Campaign details & stats
  - `list_campaigns` — List all campaigns
  - `review_posts` — AI relevancy review (2 credits/post)
  - `boost_tweet` — Amplify a specific tweet (200-300 credits)
  - `check_balance` — Credit balance
  - `credit_history` — Transaction history
- OAuth 2.1 endpoint stubs (metadata + auth flow)
- API client layer that calls existing `api.productclank.com` REST endpoints
- Dockerfile for deployment

### What's NOT Done Yet
Everything below needs implementation before going live.

---

## Phase 1: Make It Work Locally (1-2 days)

### 1.1 Install & verify basic MCP flow
```bash
cd mcp-server
npm install
npm run dev
```
- Test with MCP Inspector or Claude Desktop (local config)
- Verify `tools/list` returns all 9 tools
- Verify `tools/call` for `search_products` works with a hardcoded API key

### 1.2 Fix auth token → API key mapping
Currently `getApiKey()` in `src/tools/index.ts` reads from env var.
Need to:
- Extract the Bearer token from MCP request headers
- Look up the mapped `pck_live_*` key via `resolveApiKey()` from `oauth-endpoints.ts`
- The MCP SDK's `extra` param in tool handlers should carry the auth context

### 1.3 Test full tool flow
- Create campaign via MCP tool call
- Generate posts
- Check balance
- Boost a tweet

---

## Phase 2: Real OAuth 2.1 (2-3 days)

### 2.1 Replace in-memory stores with persistent storage
Current auth uses `Map<>` in memory — won't survive restarts.
Options:
- **Quick**: Supabase table for `mcp_oauth_clients`, `mcp_auth_codes`, `mcp_tokens`
- **Proper**: Use an OAuth library like `@panva/oauth4-webapi` or integrate Auth0/WorkOS

### 2.2 Build real authorization page
Current `/oauth/authorize` is a raw HTML form asking for an API key.
Replace with:
- ProductClank login (Privy wallet auth or email)
- Scope approval screen
- Auto-lookup of user's `pck_live_*` key from their ProductClank account
- OR auto-register an agent for them if they don't have one

### 2.3 Implement refresh token flow
- Token expiry + rotation
- `grant_type=refresh_token` support in `/oauth/token`

### 2.4 PKCE verification
Already scaffolded but needs testing. Verify S256 challenge/verifier works correctly.

---

## Phase 3: Deploy & Register (1 day)

### 3.1 Deploy to hosting
Options:
- **Vercel** (if it supports long-lived SSE streams — may not work well)
- **Railway / Render** — better for persistent Node.js servers
- **Fly.io** — good for low-latency, supports SSE
- **Cloudflare Workers** — would need to adapt to Workers runtime

Must have HTTPS (required by OAuth 2.1 spec).

### 3.2 DNS setup
- `mcp.productclank.com` → MCP server
- MCP endpoint: `https://mcp.productclank.com/mcp`

### 3.3 Register as Claude connector
Per Claude docs:
- Users add the connector URL in Claude settings
- Claude discovers tools via MCP protocol
- OAuth flow handles per-user authentication

### 3.4 Update the skill repo README
Add instructions for:
- Adding ProductClank as a Claude connector
- What the connector URL is
- What tools are available

---

## Phase 4: Production Hardening (ongoing)

### 4.1 Rate limiting
- Per-session rate limits on MCP tool calls
- Map to existing ProductClank rate limits (10 campaigns/day)

### 4.2 Logging & monitoring
- Log all tool invocations with session ID + user
- Error tracking (Sentry or similar)
- PostHog events for MCP usage analytics

### 4.3 Session persistence
- Current sessions are in-memory (lost on restart)
- Move to Redis or similar for multi-instance deployments

### 4.4 Token security
- Short-lived access tokens (1h)
- Refresh token rotation
- Token revocation endpoint

### 4.5 Input validation
- Validate all tool inputs against schemas (Zod handles this)
- Sanitize outputs before returning to Claude

---

## Architecture Reference

```
Claude.ai / Claude Desktop
    │
    ▼ (Streamable HTTP / JSON-RPC 2.0)
┌──────────────────────────────────────┐
│  ProductClank MCP Server             │
│  https://mcp.productclank.com/mcp    │
│                                      │
│  ├── POST /mcp (tool calls)          │
│  ├── GET  /mcp (SSE stream)          │
│  ├── DELETE /mcp (end session)       │
│  │                                   │
│  ├── OAuth 2.1 endpoints             │
│  │   ├── /.well-known/*              │
│  │   ├── /oauth/register             │
│  │   ├── /oauth/authorize            │
│  │   └── /oauth/token                │
│  │                                   │
│  └── Tools → API Client              │
└──────────────┬───────────────────────┘
               │ (REST API / Bearer token)
               ▼
┌──────────────────────────────────────┐
│  ProductClank API (existing)         │
│  api.productclank.com/api/v1/agents  │
└──────────────────────────────────────┘
```

## Key Decisions Still Needed

1. **OAuth provider**: Build custom (current approach) vs integrate Auth0/WorkOS?
   - Custom = more control, more work
   - Auth0 = faster, handles edge cases, costs money

2. **Auth page UX**: Ask for API key (current) vs full ProductClank login?
   - API key = simple but bad UX
   - Full login = better UX, needs Privy integration on the MCP server

3. **Hosting**: Where to deploy the MCP server?
   - Needs persistent connections (SSE)
   - Vercel may not be ideal due to function timeouts

4. **Auto-registration**: Should the OAuth flow auto-register an agent for new users?
   - Pro: Zero friction
   - Con: Every Claude user gets a ProductClank agent identity

## Files

```
mcp-server/
├── PLAN.md                          # This file
├── package.json                     # Dependencies
├── tsconfig.json                    # TypeScript config
├── Dockerfile                       # Container deployment
├── .env.example                     # Environment variables
├── .gitignore
└── src/
    ├── index.ts                     # Express server + MCP transport
    ├── config.ts                    # Environment config
    ├── tools/
    │   └── index.ts                 # 9 MCP tool definitions
    ├── auth/
    │   ├── oauth-metadata.ts        # Well-known endpoints (RFC 8414 / 9728)
    │   └── oauth-endpoints.ts       # OAuth register/authorize/token
    └── lib/
        └── productclank-api.ts      # REST API client wrapper
```
