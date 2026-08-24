# MCP tools — structure & how to add one

Tools are **grouped by domain**, one file per domain, mirroring the
[agent-skill](https://github.com/covariance-network/productclank-agent-skill)'s
capability folders. Each domain file exports a `register<Domain>Tools(server)`
function; [`index.ts`](./index.ts) composes them. This keeps each tool small and
makes adding endpoints a repeatable, low-conflict change.

```
src/
├── lib/api/            REST client, one file per domain
│   ├── client.ts       base transport (trusted key + request())
│   ├── products.ts     searchProducts, createProduct
│   ├── boost.ts        boostPost
│   ├── content.ts      composeContentCampaign, createContentCampaign
│   ├── contentStudio.ts listContentSpaces, writeContentCandidates
│   ├── campaigns.ts    create/list/getCampaign, run/getResearch, generate/getPosts, reviewPosts, regenerateReplies, addDelegate
│   ├── participation.ts getParticipationFeed, submitParticipation, getEarnings, getCreditHistory
│   ├── authorize.ts    authorizeUser (server-side, OAuth callback)
│   └── index.ts        barrel — `import * as api from "../lib/api/index.js"`
└── tools/
    ├── _shared.ts      getUserId / textResult / errorResult / NOT_AUTHED
    ├── products.ts     registerProductTools       → search_products, create_product
    ├── credits.ts      registerCreditTools        → check_balance, credit_history
    ├── boost.ts        registerBoostTools         → boost_post
    ├── content.ts      registerContentTools       → suggest_content_campaign, create_content_campaign
    ├── contentStudio.ts registerContentStudioTools → list_content_spaces, write_content_candidates
    ├── campaigns.ts    registerCampaignTools      → create/list/get_campaign, run/get_research, generate/get/review_posts, regenerate_replies, add_delegate
    ├── participation.ts registerParticipationTools → find_opportunities, submit_participation, get_earnings
    ├── playbook.ts     registerPlaybook           → grow_product prompt + productclank://capabilities resource
    └── index.ts        registerTools() — composes the above
```

## Current tools

| Tool | Domain | Wraps | Cost |
|---|---|---|---|
| `search_products` | products | `GET /agents/products/search` | free |
| `create_product` | products | `POST /agents/products` | free |
| `check_balance` | credits | reads `UserCredits` (service role) | free |
| `credit_history` | credits | `GET /agents/credits/history` | free |
| `boost_post` | boost | `POST /agents/campaigns/boost` | 200–300 cr |
| `suggest_content_campaign` | content | `POST /agents/campaigns/content` (`dry_run`) | free |
| `create_content_campaign` | content | `POST /agents/campaigns/content` | 1000 cr |
| `list_content_spaces` | contentStudio | `GET /agents/content/spaces` | free |
| `write_content_candidates` | contentStudio | `POST /agents/content/candidates` | free |
| `create_campaign` | campaigns | `POST /agents/campaigns` | 10 cr |
| `list_campaigns` / `get_campaign` / `get_posts` | campaigns | `GET /agents/campaigns{,/{id},/{id}/posts}` | free |
| `run_research` / `get_research` | campaigns | `POST/GET /agents/campaigns/{id}/research` | free |
| `generate_posts` | campaigns | `POST /agents/campaigns/{id}/generate-posts` | 12 cr/post |
| `review_posts` | campaigns | `POST /agents/campaigns/{id}/review-posts` | 2 cr/post |
| `regenerate_replies` | campaigns | `POST /agents/campaigns/{id}/regenerate-replies` | 5 cr/reply |
| `add_delegate` | campaigns | `POST /agents/campaigns/{id}/delegates` | free |
| `find_opportunities` | participation | `GET /agents/participate/feed` | free |
| `submit_participation` | participation | `POST /agents/participate/submit` | earns |
| `get_earnings` | participation | `GET /agents/participate/earnings` | free |
| `find_open_campaigns` | participation | `GET /agents/participate/campaigns` | free |
| `get_campaign_brief` | participation | `GET /agents/participate/campaigns/{id}` | free |
| `submit_campaign_work` | participation | `POST /agents/participate/campaigns/{id}/submissions` | earns |
| `get_my_submissions` | participation | `GET /agents/participate/campaigns/{id}/my-submissions` | free |

## Adding a new tool

1. **API fn** — add a typed function to the matching `src/lib/api/<domain>.ts`
   (or create a new domain file + export it from `src/lib/api/index.ts`). Trusted
   writes must pass `caller_user_id: userId`.
2. **Tool** — in `src/tools/<domain>.ts`, `server.registerTool(...)` inside the
   domain's `register<Domain>Tools`. Resolve the user with `getUserId(extra)`;
   return via `textResult` / `errorResult`. Set `annotations`
   (`readOnlyHint` for reads; `destructiveHint` when it spends credits).
3. **Wire it** — if you added a new domain, call its registrar in
   [`index.ts`](./index.ts).
4. **Parity** — add the endpoint to [`../../capabilities.json`](../../capabilities.json)
   with an `mcp` status (`live` once shipped) and update
   [`../../CAPABILITIES.md`](../../CAPABILITIES.md). CI (`npm run check:parity`)
   fails if the skill references an endpoint missing from `capabilities.json`.
5. **Verify** — `npm run typecheck`.
