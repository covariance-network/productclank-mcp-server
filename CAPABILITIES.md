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
| `POST /agents/campaigns/boost` | ✅ | `boost_post` |
| `POST /agents/campaigns/content` | ✅ | `suggest_content_campaign` (free preview) + `create_content_campaign` (1000cr) |
| `GET /agents/credits/balance` | ✅ | `check_balance` (reads `UserCredits` directly) |
| `POST /agents/campaigns` | 🔜 T1 | `create_campaign` |
| `GET /agents/campaigns` | 🔜 T1 | `list_campaigns` |
| `GET /agents/campaigns/{id}` | 🔜 T1 | `get_campaign` |
| `POST /agents/campaigns/{id}/generate-posts` | 🔜 T1 | `generate_posts` |
| `POST/GET /agents/campaigns/{id}/research` | 🔜 T1 | `run_research` / `get_research` |
| `GET /agents/campaigns/{id}/posts` | 🔜 T1 | `get_posts` |
| `POST /agents/campaigns/{id}/review-posts` | 🔜 T1 | `review_posts` |
| `POST /agents/campaigns/{id}/regenerate-replies` | 🔜 T1 | `regenerate_replies` |
| `POST /agents/campaigns/{id}/delegates` | 🔜 T1 | `add_delegate` |
| `GET /agents/credits/history` | 🔜 T1 | `credit_history` |
| `GET /agents/participate/feed` | 🔜 T2 | `find_opportunities` |
| `POST /agents/participate/submit` | 🔜 T2 | `submit_participation` ⚠️ needs backend author-match vs caller's X handle |
| `GET /agents/participate/earnings` | 🔜 T2 | `get_earnings` |
| `POST /agents/participate/claim-signature` | 🚫 T3 | $PRO pays agent wallet + ERC-8004/allowlist; no user-wallet path yet |
| `POST /agents/participate/record-claim` | 🚫 T3 | pairs with claim-signature |
| `POST /agents/register`, `/create-link`, `/me`, `/rotate-key`, `/import`, `/by-user`, `/authorize` (×2), `/telegram/*` | 🚫 | replaced by OAuth / not a connector concern (see `capabilities.json`) |
| `POST /agents/credits/topup` | 🚫 | **policy:** keep crypto top-up off the connector; spend prefunded balance only |

## Roadmap (planned tiers)

- **Tier 1 — round out "grow my product":** the campaign tools above. All wrap
  endpoints that already support `caller_user_id` (trusted-agent multi-tenant billing),
  so no backend work — purely additive MCP tools.
- **Tier 2 — participation "find & earn":** `find_opportunities` + `submit_participation`
  (+ `get_earnings`) → earn points/credits. **Requires one backend change:** when
  `caller_user_id` is set, `POST /agents/participate/submit` must author-match the tweet
  against the *caller's* `UserSocial.twitter`, not the trusted agent's handle. Also needs
  the user to have a linked X handle. v1 is a coach flow (Claude can't post to X — the
  user posts the draft, pastes the URL back).
- **Tier 3 — user-wallet $PRO + X auto-posting:** a user-facing $PRO claim (today $PRO is
  agent-wallet-only, ERC-8004/allowlist gated) and X OAuth so Claude posts on the user's
  behalf.
