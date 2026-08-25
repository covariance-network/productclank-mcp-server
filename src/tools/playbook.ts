/**
 * Playbook — MCP prompt + resource for agent-native onboarding.
 *
 * `grow_product` is a ready-made operating procedure an MCP client can pull
 * into context; `productclank://capabilities` serves the tool roster with
 * costs so agents can plan spend before calling anything.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const PLAYBOOK = `You are operating ProductClank — a community-powered growth platform — for the connected user. Goal: grow the product below with real community engagement, spending the user's credits deliberately.

Product to grow: {{product}}

## Operating procedure

1. **Resolve the product.** Call search_products with the product name. If it isn't listed, call create_product with its website URL (free — the server auto-fills the listing).
2. **Check the budget.** Call check_balance. Rough costs: discovery campaign 10 to create + 12/post discovered; post review 2/post; reply redraft 5/reply; boost 200–300; content campaign 1000. Never start a paid step the balance can't cover, and confirm each spend with the user first.
3. **Pick the play (combine when budget allows):**
   - **Conversations play** — create_campaign with 3–8 focused keywords (PRIVATE by default — ask before making it public: public drafts are posted by the network and bill the user per reply). Research auto-runs at create (~30s) — read it with get_research (FREE); its expanded keywords feed the next discovery run automatically. Then generate_posts, get_posts, review_posts (dry_run first), regenerate_replies where drafts miss the tone. Manage anytime in the workbench via the campaign's admin_url.
   - **Moment play** — the user has a specific post that deserves reach: boost_post (replies/likes/repost).
   - **Content play** — the user wants the community creating content: suggest_content_campaign (FREE dry-run) → create_content_campaign once they approve the 1000-credit spend.
4. **Close the loop.** After each paid step: get_campaign_results for spend vs outcomes (funnel, approval rate, cost per usable reply), credit_history for the ledger, and report both to the user with what you'd do next. Hand long-running campaigns to the human with add_delegate so they can manage them at app.productclank.com/my-campaigns.
5. **Keep it running across sessions.** A campaign is a standing operation, not a one-shot. At the start of a session call get_campaign_activity with the checked_at value from last time — new posts, new claims, live links to what went out. Then adjust with update_campaign (all free): add keywords that are working, enable the phrases/influencers sources research found (they stay dormant until enabled), raise relevance_threshold if discovery is noisy, pause with is_active:false if the user wants to stop spending. If drafts are piling up unposted, that is the moment to offer public visibility — the community posts them instead of the user.

## Rules
- Free before paid: run_research and dry-runs come before any billable call.
- One step at a time — never chain paid calls without reporting results in between.
- If a call returns a daily-spend-cap error, stop and tell the user to adjust it in ProductClank → Profile → Connected Apps.`;

export function registerPlaybook(server: McpServer): void {
  server.registerPrompt(
    "grow_product",
    {
      title: "Grow a product on ProductClank",
      description:
        "A ready-made operating procedure for growing a product with ProductClank campaigns: resolve product → budget → research (free) → campaign/boost/content plays → report results.",
      argsSchema: {
        product: z
          .string()
          .describe("The product to grow — name, website URL, or a short description"),
      },
    },
    ({ product }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: PLAYBOOK.replace("{{product}}", product),
          },
        },
      ],
    })
  );

  server.registerResource(
    "capabilities",
    "productclank://capabilities",
    {
      title: "ProductClank connector capabilities & costs",
      description:
        "Tool roster grouped by persona (grow / earn / content) with credit costs — read before planning spend.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: `# ProductClank connector — tools & costs

## Grow (builder persona)
| Tool | Cost |
|---|---|
| search_products / create_product | free |
| create_campaign | 10 |
| run_research / get_research | free |
| generate_posts | 12 per post discovered |
| get_posts / list_campaigns / get_campaign | free |
| get_campaign_activity (what's new since last check) | free |
| get_campaign_results (spend vs outcomes) | free |
| update_campaign (keywords, sources, relevance bar, pause, visibility) | free |
| review_posts | 2 per post (dry_run billed too) |
| regenerate_replies | 5 per reply |
| add_delegate | free |
| boost_post | 200 (replies) / 300 (likes, repost) |

## Content
| Tool | Cost |
|---|---|
| suggest_content_campaign | free (dry-run) |
| create_content_campaign | 1000 |
| list_content_spaces / write_content_candidates | free |

## Earn (participant persona)
| Tool | Cost |
|---|---|
| find_opportunities (reply drafts to post) | free |
| submit_participation | free — EARNS points/credits for the user |
| find_open_campaigns (content + take-action campaigns) | free |
| get_campaign_brief | free |
| submit_campaign_work | free — EARNS Stars/points on owner approval |
| get_my_submissions | free |
| get_earnings | free |

## Credits
check_balance and credit_history are free. Top-ups happen on the webapp only: app.productclank.com/credits/purchase. Users cap connector spend in Profile → Connected Apps; a cap error means the user must raise it there.`,
        },
      ],
    })
  );
}
