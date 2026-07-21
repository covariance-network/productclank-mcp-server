# ProductClank MCP Server

**Launch community growth campaigns from your AI assistant.** ProductClank turns real communities (and their agents) into a distribution network — this MCP server lets Claude or any MCP client rally that network on your behalf: boost a post with real replies, likes, and reposts; launch community content campaigns; draft social content into your own pipeline.

- **Remote server:** `https://mcp.productclank.com/mcp` (Streamable HTTP)
- **Auth:** OAuth 2.1 — sign in with your ProductClank account, revoke anytime
- **Billing:** your ProductClank credits, per-tool costs shown below, with per-app daily spend caps
- **Website:** [productclank.com/mcp](https://www.productclank.com/mcp)

## Connect from Claude

1. In Claude, add a **custom connector** with the URL:
   ```
   https://mcp.productclank.com/mcp
   ```
2. Approve the OAuth prompt — it signs you into ProductClank (Google or email) and asks for consent.
3. Ask Claude things like:
   > "Boost this post with replies from the ProductClank community: https://x.com/…"
   > "Preview a content campaign for my product."
   > "What's my ProductClank credit balance?"

Works in any MCP client that supports remote servers with OAuth (Claude web/desktop, Claude Code, and others).

## Tools

| Tool | What it does | Cost |
|---|---|---|
| `search_products` | Resolve your ProductClank products to a `product_id` (required for campaigns) | free |
| `check_balance` | Your credit balance and plan | free |
| `boost_post` | Rally the community to engage a specific post — 10 AI-drafted replies (200 cr), 30 likes or 10 reposts (300 cr). Auto-detects platform from the URL: **X, Instagram, TikTok, LinkedIn, Reddit, Farcaster** | 200–300 cr |
| `suggest_content_campaign` | AI-drafted preview of a community content campaign (title, description, CTA) + affordability check. Nothing is created | free |
| `create_content_campaign` | Launch the content campaign: the community creates posts/threads/videos for your product; submissions and winner selection happen in the web app | 1,000 cr |
| `list_content_spaces` | Content Studio: list the content spaces you can draft into | free |
| `write_content_candidates` | Content Studio: draft up to 25 post candidates into your space. They land as **unreviewed drafts** — a human reviews and schedules; nothing auto-publishes | free |

Costly actions are designed to be confirmed with the user first — tool descriptions instruct the model to preview and state the credit cost before spending.

## How auth & billing work

The server is an OAuth 2.1 authorization server backed by the ProductClank web app (`/connect/mcp` login + consent). Every `/mcp` request requires a valid access token; tools act **as the connected user** and bill **that user's** credit balance. Users can see and revoke the connector — and set a **daily credit spend cap** per connected app — from their ProductClank profile ("Connected Apps").

## Architecture

A thin Express + [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) wrapper over ProductClank's public agent REST API (`/api/v1/agents/*`). The REST API is canonical; this server and the [ProductClank agent skill](https://github.com/covariance-network/productclank-agent-skill) are parallel wrappers — [`capabilities.json`](./capabilities.json) is the parity source of truth and CI fails when they drift (`npm run check:parity`).

```
Claude / MCP client ──▶ mcp.productclank.com/mcp (this server)
                          │  OAuth 2.1 AS ──▶ productclank.com/connect/mcp (login + consent)
                          └─▶ ProductClank agent REST API (/api/v1/agents/*)
```

## Development

```bash
cp .env.example .env   # fill in (see DEPLOYMENT.md)
npm install
npm run dev            # tsx watch
npm run typecheck
npm run build && npm start
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment (Docker / Railway) and [CAPABILITIES.md](./CAPABILITIES.md) for the tool roadmap.

## Registry

Published to the official MCP Registry as **`com.productclank/productclank`** — see [`server.json`](./server.json).

## Links

- [What is ProductClank?](https://www.productclank.com/landing) · [MCP connector page](https://www.productclank.com/mcp) · [For agents & developers](https://www.productclank.com/agents)
- Issues & support: [GitHub issues](https://github.com/covariance-network/productclank-mcp-server/issues) or in-app support

## License

[MIT](./LICENSE)
