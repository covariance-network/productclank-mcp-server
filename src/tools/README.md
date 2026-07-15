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
│   ├── products.ts     searchProducts
│   ├── boost.ts        boostPost
│   ├── content.ts      composeContentCampaign, createContentCampaign
│   ├── authorize.ts    authorizeUser (server-side, OAuth callback)
│   └── index.ts        barrel — `import * as api from "../lib/api/index.js"`
└── tools/
    ├── _shared.ts      getUserId / textResult / errorResult / NOT_AUTHED
    ├── products.ts     registerProductTools  → search_products
    ├── credits.ts      registerCreditTools   → check_balance
    ├── boost.ts        registerBoostTools    → boost_post
    ├── content.ts      registerContentTools  → suggest_content_campaign, create_content_campaign
    └── index.ts        registerTools() — composes the above
```

## Current tools

| Tool | Domain | Wraps | Cost |
|---|---|---|---|
| `search_products` | products | `GET /agents/products/search` | free |
| `check_balance` | credits | reads `UserCredits` (service role) | free |
| `boost_post` | boost | `POST /agents/campaigns/boost` | 200–300 cr |
| `suggest_content_campaign` | content | `POST /agents/campaigns/content` (`dry_run`) | free |
| `create_content_campaign` | content | `POST /agents/campaigns/content` | 1000 cr |

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
