# MCP tools — structure & how to add one

Tools are **grouped by domain**, one file per domain, mirroring the
[agent-skill](https://github.com/covariance-network/productclank-agent-skill)'s
capability folders. Each domain file exports a `register<Domain>Tools(server)`
function; [`index.ts`](./index.ts) composes them. This keeps each tool small and
makes adding endpoints a repeatable, low-conflict change.

```
src/
├── lib/api/            REST client, one file per domain
│   ├── client.ts       base transport (per-user agent key resolved at request time)
│   ├── products.ts     searchProducts, createProduct
│   ├── boost.ts        boostPost
│   ├── watchQuiz.ts    createWatchQuiz, suggestQuizQuestions, getWatchQuizResults
│   ├── content.ts      composeContentCampaign, createContentCampaign
│   ├── contentStudio.ts listContentSpaces, getContentWorkspace, setupContentWorkspace, list/add/update/remove/suggestContentTopics, writeContentCandidates, getContentQueue, actOnContentDraft, teachContentVoice
│   ├── campaigns.ts    create/list/getCampaign, run/getResearch, generate/getPosts, reviewPosts, regenerateReplies, updateCampaign, getCampaignActivity, getCampaignResults, addDelegate
│   ├── participation.ts getParticipationFeed, submitParticipation, getEarnings, getCreditHistory
│   ├── scout.ts        getScoutDeals, claimScoutDeal, releaseScoutDeal, reportScoutDealProgress, rateScoutDeal, getScoutEarnings
│   ├── support.ts      reportIssue, getSupportTickets
│   ├── authorize.ts    authorizeUser (server-side, OAuth callback)
│   └── index.ts        barrel — `import * as api from "../lib/api/index.js"`
└── tools/
    ├── _shared.ts      getUserId / textResult / errorResult / NOT_AUTHED / DecisionOffer
    ├── instrument.ts   registerTool proxy → PostHog tool-call / tool-error events
    ├── products.ts     registerProductTools       → search_products, create_product
    ├── credits.ts      registerCreditTools        → check_balance, credit_history
    ├── boost.ts        registerBoostTools         → boost_post
    ├── watchQuiz.ts    registerWatchQuizTools     → create_watch_quiz, suggest_quiz_questions, get_watch_quiz_results (full profile only)
    ├── tiktokCampaign.ts registerTikTokCampaignTools → launch_tiktok_campaign (full profile only)
    ├── content.ts      registerContentTools       → suggest_content_campaign, create_content_campaign
    ├── contentStudio.ts registerContentStudioTools → list_content_spaces, get_content_workspace, setup_content_space, manage_content_topics, write_content_candidates, get_content_queue, revise_content_draft, teach_content_voice
    ├── campaigns.ts    registerCampaignTools      → create/list/get_campaign, run/get_research, generate/get/review_posts, regenerate_replies, get_campaign_activity, get_campaign_results, update_campaign, add_delegate
    ├── participation.ts registerParticipationTools → find_opportunities, submit_participation, get_earnings
    ├── growthAssistant.ts registerGrowthAssistantTools → setup_growth_assistant, get_growth_suggestions (full profile only)
    ├── scout.ts        registerScoutTools         → get_scout_deals, claim_deal, release_deal, report_deal_progress, rate_deal, get_scout_earnings (full profile only)
    ├── support.ts      registerSupportTools       → report_issue, get_support_status
    ├── playbook.ts     registerPlaybook           → grow_product + setup_content_space prompts + productclank://capabilities resource
    └── index.ts        registerTools() — composes the above
```

## Current tools

| Tool | Domain | Wraps | Cost |
|---|---|---|---|
| `search_products` | products | `GET /agents/products/search` | free |
| `create_product` | products | `POST /agents/products` | free |
| `check_balance` | credits | reads `UserCredits` (service role) | free |
| `credit_history` | credits | `GET /agents/credits/history` | free |
| `boost_post` | boost | `POST /agents/campaigns/boost` | 20 cr/draft (replies, quote; `count` 1–10) / likes 300 cr per 30 (`count` 1–300 at 10 cr each) / 300 cr (bookmarks, repost); `watch_quiz` +100 cr per graded answer |
| `create_watch_quiz` | watchQuiz | `POST /agents/campaigns/watch-quiz` | 100 cr per correct answer over 24h (wrong free) (cap `max_answers`, default 20); 0 at create |
| `launch_tiktok_campaign` | tiktokCampaign | `boost` ×2 + `watch-quiz` (via boost `watch_quiz`) | likes 10 cr each (`likes_count` 1–300, default 30 = 300 cr) + replies 20 cr each up front; quiz 100 cr per correct answer (cap `quiz_answers` 0–1000, default 10); +40 cr if questions are suggested. Plan call free, `confirmed: true` creates |
| `suggest_quiz_questions` | watchQuiz | `POST /agents/campaigns/watch-quiz/suggest-questions` | 40 cr (only on success) |
| `get_watch_quiz_results` | watchQuiz | `GET /agents/campaigns/watch-quiz/{id}` | free |
| `suggest_content_campaign` | content | `POST /agents/campaigns/content` (`dry_run`) | free |
| `create_content_campaign` | content | `POST /agents/campaigns/content` | 1000 cr |
| `list_content_spaces` | contentStudio | `GET /agents/content/spaces` | free |
| `get_content_workspace` | contentStudio | `GET /agents/content/workspace` | free |
| `setup_content_space` | contentStudio | `POST /agents/content/workspace` | free (5 cr with brand_doc) |
| `manage_content_topics` | contentStudio | `GET/POST/PATCH/DELETE /agents/content/topics`, `POST …/topics/suggest` | free |
| `write_content_candidates` | contentStudio | `POST /agents/content/candidates` | free |
| `get_content_queue` | contentStudio | `GET /agents/content/queue` | free |
| `revise_content_draft` | contentStudio | `PATCH /agents/content/drafts` | free / 2 cr |
| `teach_content_voice` | contentStudio | `POST /agents/content/feedback` | 1 cr |
| `create_campaign` | campaigns | `POST /agents/campaigns` | 10 cr |
| `list_campaigns` / `get_campaign` / `get_posts` | campaigns | `GET /agents/campaigns{,/{id},/{id}/posts}` | free |
| `run_research` / `get_research` | campaigns | `POST/GET /agents/campaigns/{id}/research` | free |
| `generate_posts` | campaigns | `POST /agents/campaigns/{id}/generate-posts` | 12 cr/post |
| `review_posts` | campaigns | `POST /agents/campaigns/{id}/review-posts` | 2 cr/post |
| `regenerate_replies` | campaigns | `POST /agents/campaigns/{id}/regenerate-replies` | 5 cr/reply |
| `update_campaign` | campaigns | `PATCH /agents/campaigns/{id}` | free |
| `get_campaign_activity` | campaigns | `GET /agents/campaigns/{id}/activity` | free |
| `get_campaign_results` | campaigns | `GET /agents/campaigns/{id}/results` | free |
| `add_delegate` | campaigns | `POST /agents/campaigns/{id}/delegates` | free |
| `find_opportunities` | participation | `GET /agents/participate/feed` | free |
| `submit_participation` | participation | `POST /agents/participate/submit` | earns |
| `get_earnings` | participation | `GET /agents/participate/earnings` | free |
| `find_open_campaigns` | participation | `GET /agents/participate/campaigns` | free |
| `get_campaign_brief` | participation | `GET /agents/participate/campaigns/{id}` | free (watch quizzes: `participation: "human_only"` → send the user to the page) |
| `submit_campaign_work` | participation | `POST /agents/participate/campaigns/{id}/submissions` | earns |
| `get_my_submissions` | participation | `GET /agents/participate/campaigns/{id}/my-submissions` | free |
| `setup_growth_assistant` | growthAssistant | `POST /agents/growth-assistant` | free ($5/month subscription in the app) |
| `get_growth_suggestions` | growthAssistant | `GET /agents/growth-assistant` | free |
| `get_scout_deals` | scout | `GET /agents/scout/deals` | free |
| `claim_deal` | scout | `POST /agents/scout/deals/{dealId}/claim` | free |
| `release_deal` | scout | `POST /agents/scout/deals/{dealId}/release` | free |
| `report_deal_progress` | scout | `POST /agents/scout/deals/{dealId}/progress` | free |
| `rate_deal` | scout | `POST /agents/scout/deals/{dealId}/rating` | free |
| `get_scout_earnings` | scout | `GET /agents/scout/earnings` | free |
| `report_issue` | support | `POST /agents/support` | free |
| `get_support_status` | support | `GET /agents/support` | free |

## Adding a new tool

1. **API fn** — add a typed function to the matching `src/lib/api/<domain>.ts`
   (or create a new domain file + export it from `src/lib/api/index.ts`). Pass the
   acting user's id as `request()`'s first argument — the call authenticates as
   that user's own per-user agent (no `caller_user_id` field; the backend 403s
   non-trusted agents that send one).
2. **Tool** — in `src/tools/<domain>.ts`, `server.registerTool(...)` inside the
   domain's `register<Domain>Tools`. Resolve the user with `getUserId(extra)`;
   return via `textResult` / `errorResult`. Set `annotations`
   (`readOnlyHint` for reads; `destructiveHint` when it spends credits).
   If the result carries something the *user* must know or decide, add a
   `user_note` and/or a `decision_offer` (see `_shared.ts`) — the tool
   description is read by the model, not by the person paying. Telemetry is
   automatic: every tool registered through `registerTools` goes through the
   `instrument.ts` proxy.
3. **Wire it** — if you added a new domain, call its registrar in
   [`index.ts`](./index.ts).
4. **Parity** — add the endpoint to [`../../capabilities.json`](../../capabilities.json)
   with an `mcp` status (`live` once shipped) and update
   [`../../CAPABILITIES.md`](../../CAPABILITIES.md). CI (`npm run check:parity`)
   fails if the skill references an endpoint missing from `capabilities.json`.
5. **Verify** — `npm run typecheck`.
