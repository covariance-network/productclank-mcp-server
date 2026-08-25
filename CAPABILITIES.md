# MCP ↔ Agent-Skill Parity

**The ProductClank agent REST API (`/api/v1/agents/*`) is the single source of truth.**
The [agent skill](https://github.com/covariance-network/productclank-agent-skill) and
this MCP server are **both wrappers** over that API. They drift unless we keep them
aligned — so every agent endpoint the skill documents is tracked in
[`capabilities.json`](./capabilities.json) with an explicit MCP status.

> Parity means **intentional coverage decisions**, not 1:1. Some skill endpoints are
> deliberately *not* MCP tools (registration/linking is replaced by OAuth; credit
> top-up is kept off the connector for the crypto-policy reason).

## How it stays in sync

1. **`capabilities.json`** — machine-readable matrix (source of truth for this repo).
   Every agent endpoint → `live` | `planned` | `excluded`.
2. **`scripts/check-skill-parity.mjs`** (`npm run check:parity`) — fetches the skill's
   docs from GitHub, extracts every endpoint it references, and **fails** if the skill
   mentions one that isn't in `capabilities.json`. Runs on every PR + weekly cron
   (`.github/workflows/skill-parity.yml`).
3. **PR checklist** — the PR template reminds contributors to update `capabilities.json`
   when an agent capability changes.

**When the check fails (drift):** the skill grew a new capability. Add it to
`capabilities.json` with a status — `planned` (we'll build a tool, set a `tier`),
`excluded` (with a `note` why), or `live` (if you just shipped the tool) — and re-run.

## Status snapshot

Legend: ✅ live · 🔜 planned (tier) · 🚫 excluded

| Endpoint | Status | MCP tool / reason |
|---|---|---|
| `GET /agents/products/search` | ✅ | `search_products` |
| `POST /agents/products` | ✅ | `create_product` (URL-first token-free listing, free) |
| `POST /agents/campaigns/boost` | ✅ | `boost_post` |
| `POST /agents/campaigns/content` | ✅ | `suggest_content_campaign` (free preview) + `create_content_campaign` (1000cr) |
| `GET /agents/content/spaces` | ✅ | `list_content_spaces` (Content Studio) |
| `POST /agents/content/candidates` | ✅ | `write_content_candidates` (Content Studio — free, human-reviewed drafts) |
| `GET /agents/credits/balance` | ✅ | `check_balance` (reads `UserCredits` directly) |
| `POST /agents/campaigns` | ✅ | `create_campaign` (10cr) |
| `GET /agents/campaigns` | ✅ | `list_campaigns` (caller-scoped for trusted agents) |
| `GET /agents/campaigns/{id}` | ✅ | `get_campaign` |
| `POST /agents/campaigns/{id}/generate-posts` | ✅ | `generate_posts` (12cr/post) |
| `POST/GET /agents/campaigns/{id}/research` | ✅ | `run_research` / `get_research` (free) |
| `GET /agents/campaigns/{id}/posts` | ✅ | `get_posts` |
| `POST /agents/campaigns/{id}/review-posts` | ✅ | `review_posts` (2cr/post, dry_run billed too) |
| `POST /agents/campaigns/{id}/regenerate-replies` | ✅ | `regenerate_replies` (5cr/reply) |
| `POST /agents/campaigns/{id}/delegates` | ✅ | `add_delegate` |
| `PATCH /agents/campaigns/{id}` | ✅ | `update_campaign` (free — keywords merge, discovery sources, relevance bar, pause/resume, visibility flip, platform + Reddit/YouTube targeting) |
| `GET /agents/campaigns/{id}/activity` | ✅ | `get_campaign_activity` (free — since-watermark delta with live posted links) |
| `GET /agents/campaigns/{id}/results` | ✅ | `get_campaign_results` (free — funnel, approval + survival rates, cost per usable reply) |
| `GET /agents/campaigns/{id}/schedule` | ✅ | `set_campaign_schedule` (free — the un-confirmed call is the read: changes nothing, returns the projection) |
| `PUT /agents/campaigns/{id}/schedule` | ✅ | `set_campaign_schedule` (free to call; **authorizes unattended spend** — 12cr/post found, hourly, no human in the loop. Enabling requires `confirm:true` after showing the projection; the per-app daily spend cap is enforced here as a ceiling because scheduled runs never pass through it) |
| `GET /agents/credits/history` | ✅ | `credit_history` (caller-scoped for trusted agents) |
| `GET /agents/participate/feed` | ✅ | `find_opportunities` |
| `POST /agents/participate/submit` | ✅ | `submit_participation` (author-match vs the EARNING user's linked X handle) |
| `GET /agents/participate/earnings` | ✅ | `get_earnings` (caller-scoped reply counts) |
| `GET /agents/participate/campaigns` | ✅ | `find_open_campaigns` (public + the user's community campaigns) |
| `GET /agents/participate/campaigns/{id}` | ✅ | `get_campaign_brief` |
| `POST /agents/participate/campaigns/{id}/submissions` | ✅ | `submit_campaign_work` (pending → owner review → Stars/points) |
| `GET /agents/participate/campaigns/{id}/my-submissions` | ✅ | `get_my_submissions` |
| `POST /agents/participate/claim-signature` | 🚫 T3 | $PRO pays agent wallet + ERC-8004/allowlist; no user-wallet path yet |
| `POST /agents/participate/record-claim` | 🚫 T3 | pairs with claim-signature |
| `POST /agents/register`, `/create-link`, `/me`, `/rotate-key`, `/import`, `/by-user`, `/authorize` (×2), `/telegram/*` | 🚫 | replaced by OAuth / not a connector concern (see `capabilities.json`) |
| `POST /agents/credits/topup` | 🚫 | **policy:** keep crypto top-up off the connector; spend prefunded balance only |

Besides tools, the server ships one MCP **prompt** (`grow_product` — the operating
procedure for the growth-agent persona) and one **resource**
(`productclank://capabilities` — the tool/cost roster agents read before planning spend).

## Multi-tenant scoping (why Tier 1/2 needed backend work after all)

The connector is ONE trusted agent acting for many OAuth users, but the campaign
routes originally scoped ownership by `creator_agent_id` alone — so any connected
user could have listed/operated any other connector user's campaigns. The webapp
now enforces per-caller scope (`creator_id === caller_user_id`, via
`checkTrustedCampaignScope` in `lib/agent-auth.ts`) on every campaign read/op,
scopes `credits/history` + `participate/earnings` to the caller, and feeds real
`pendingCredits` into the daily-spend cap on per-item-billed routes. Trusted
agents MUST pass `caller_user_id` on those routes.

## Roadmap

- **Tier 3 — user-wallet $PRO + X auto-posting:** a user-facing $PRO claim (today $PRO is
  agent-wallet-only, ERC-8004/allowlist gated) and X OAuth so Claude posts on the user's
  behalf. Until then participation is a coach flow: the user posts the draft from their
  own X account and the connector submits the URL.
- **Next (results & management):** campaign outcome reporting (posts delivered, replies
  claimed/approved, engagement), pause/edit/delete, mention scans, GitHub-star community
  campaigns — needs new `/v1` backend routes ported from the webapp.
