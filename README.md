# ProductClank MCP Server

**Launch community growth campaigns from your AI assistant.** ProductClank turns real communities (and their agents) into a distribution network — this MCP server lets Claude, ChatGPT, or any MCP client rally that network on your behalf: boost a post with real replies, likes, and reposts; launch community content campaigns; draft social content into your own pipeline.

- **Remote server:** `https://mcp.productclank.com/mcp` (Streamable HTTP)
- **Auth:** OAuth 2.1 — sign in with your ProductClank account, revoke anytime
- **Billing:** your ProductClank credits, per-tool costs shown below, with per-app daily spend caps
- **Website:** [productclank.com/mcp](https://www.productclank.com/mcp)

The **same URL** works in both Claude and ChatGPT — the only difference is where each app hides its "add a connector" screen (and, for ChatGPT, a plan/Developer-mode requirement). Once connected, both drive the identical tools below.

## Connect from Claude

1. In Claude, go to **Settings → Connectors → Add custom connector** (Desktop or web).
2. Paste the URL:
   ```
   https://mcp.productclank.com/mcp
   ```
3. Approve the OAuth prompt — it signs you into ProductClank (Google or email) and asks for consent.
4. Ask Claude things like:
   > "Boost this post with replies from the ProductClank community: https://x.com/…"
   > "Preview a content campaign for my product."
   > "What's my ProductClank credit balance?"

## Connect from ChatGPT

ChatGPT reaches custom MCP connectors through **Developer mode**.

> **Requirements** — Custom connectors need a paid ChatGPT plan (**Pro, Plus, Business, Enterprise, or Education**) on the **web app**. They are **not** available on the free tier, so free-tier users won't see an "add connector" option — this is a ChatGPT limitation, not a ProductClank one.

1. In ChatGPT on the web, open **Settings → Apps & Connectors → Advanced settings** and turn on **Developer mode**.
2. Back in **Apps & Connectors**, click **Create** / **Add custom connector**.
3. Give it a name (e.g. `ProductClank`), a short description, and the MCP server URL:
   ```
   https://mcp.productclank.com/mcp
   ```
4. Choose **OAuth** as the authentication method and connect — it signs you into ProductClank (Google or email) and asks for consent, exactly like Claude.
5. In a chat, enable the ProductClank connector and ask it to boost a post, preview a campaign, or check your balance.

Works in any MCP client that supports remote servers with OAuth (Claude web/desktop, Claude Code, ChatGPT Developer mode, and others).

## Tools

### Grow — run growth campaigns for a product

| Tool | What it does | Cost |
|---|---|---|
| `search_products` | Resolve your ProductClank products to a `product_id` | free |
| `create_product` | List a product from just its website URL (token-free listing, auto-filled) | free |
| `create_campaign` | Create a discovery campaign: continuously find relevant posts + draft community replies | 10 cr |
| `run_research` / `get_research` | Topic & competitor analysis — the free pre-flight before spending | free |
| `generate_posts` | Run discovery: scrape matching posts and draft a reply for each | 12 cr/post |
| `list_campaigns` / `get_campaign` / `get_posts` | Campaign inventory, config + stats, discovered posts & drafts | free |
| `review_posts` | AI-score posts against relevancy rules, prune the irrelevant (dry-run billed too) | 2 cr/post |
| `regenerate_replies` | Redraft selected replies with an edit request | 5 cr/reply |
| `get_campaign_activity` | What's new since the last check — posts found, replies claimed, live links to what went out | free |
| `get_campaign_results` | Spend vs outcomes: the funnel, approval + survival rates, cost per usable reply | free |
| `update_campaign` | Merge keywords, enable the discovery sources research found, move the relevance bar, pause/resume, change who posts the drafts | free |
| `add_delegate` | Hand a campaign to a human to manage in the web app | free |
| `boost_post` | Rally the community to engage a specific post — 10 AI-drafted replies (200 cr), 30 likes or 10 reposts (300 cr). Auto-detects platform from the URL: **X, Instagram, TikTok, LinkedIn, Reddit, Farcaster, YouTube** | 200–300 cr |

### Earn — participate in campaigns for the connected user

| Tool | What it does | Cost |
|---|---|---|
| `find_opportunities` | Browse unclaimed reply drafts the user can post to earn (replies only — likes and reposts need a screenshot and stay in the web app) | free |
| `submit_participation` | Submit the posted reply's URL — verified against the user's linked X handle, then points/credits are awarded | earns |
| `find_open_campaigns` | Discover content & take-action campaigns the user can join — public ones plus their communities' | free |
| `get_campaign_brief` | Read a campaign's full brief: what to create or do, judging criteria, rewards, deadline, remaining allowance | free |
| `submit_campaign_work` | Submit the user's work: a content or action-proof URL, a hosted image/video made for the task (`media_url` — links only, no uploads), and/or a description. X posts are author-verified. Pending → owner review → Stars/points | earns |
| `get_my_submissions` | Track submission status + the reviewer's notes | free |
| `get_earnings` | The user's participation totals: points, credits, reply stats | free |

### Content Studio

| Tool | What it does | Cost |
|---|---|---|
| `suggest_content_campaign` | AI-drafted preview of a community content campaign (title, description, CTA) + affordability check. Nothing is created | free |
| `create_content_campaign` | Launch the content campaign: the community creates posts/threads/videos for your product; submissions and winner selection happen in the web app | 1,000 cr |
| `list_content_spaces` | List the content spaces you can draft into | free |
| `write_content_candidates` | Draft up to 25 post candidates into your space. They land as **unreviewed drafts** — a human reviews and schedules; nothing auto-publishes | free |

### Credits

| Tool | What it does | Cost |
|---|---|---|
| `check_balance` | Your credit balance and plan | free |
| `credit_history` | Your credit transactions (spend + rewards), newest first | free |

The server also exposes an MCP **prompt** — `grow_product`, a ready-made operating
procedure for the growth loop — and a **resource** — `productclank://capabilities`,
the tool/cost roster — so agents can plan spend before calling anything.

Costly actions are designed to be confirmed with the user first — tool descriptions instruct the model to preview and state the credit cost before spending.

## How auth & billing work

The server is an OAuth 2.1 authorization server backed by the ProductClank web app (`/connect/mcp` login + consent). Every `/mcp` request requires a valid access token; tools act **as the connected user** and bill **that user's** credit balance. Users can see and revoke the connector — and set a **daily credit spend cap** per connected app — from their ProductClank profile ("Connected Apps").

## Communication contract

Tool results are read by an assistant, not by the person paying the credits, so
anything the user must **know** or **decide** travels in the payload:

- `user_note` — one or two plain sentences for the assistant to relay.
- `decision_offer` — a real choice (`question` + `options` with `what_happens`
  and `cost` + `current` + `how_to_apply`) for the assistant to present, never
  to answer on the user's behalf.

The main one is distribution: campaigns are created **private** (drafts wait in
the owner's workbench) and the result offers community distribution — the
reach the platform exists for — as an explicit, costed choice. Spends get the
same treatment: `suggest_content_campaign` returns the 1000-credit launch as a
yes/no, and a `review_posts` dry run says what it already cost and what the
next step actually changes.

## Telemetry

The server emits three PostHog events — `mcp_connected` (OAuth consent
completed), `mcp_tool_called` (every tool, with `ok` and `duration_ms`) and
`mcp_tool_error` (failures, with the message) — so the connect → first-call →
repeat-use funnel is measurable and refused calls double as roadmap signal.
Events are keyed to the user's Supabase auth id where resolvable, so connector
activity joins the same PostHog person as their webapp activity. Capture is
fire-and-forget and the whole thing no-ops without `POSTHOG_API_KEY`. See
[`src/lib/analytics.ts`](./src/lib/analytics.ts); tools are instrumented
centrally in [`src/tools/instrument.ts`](./src/tools/instrument.ts).

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
