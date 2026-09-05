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
   - **Conversations play** — first READ THE PRODUCT'S SITE: fetch its website (and anything else the user pointed at) and derive the keywords and search_context from who the audience actually is and the phrases they use when they have the problem — not from the product's name. That derivation is your work, done here, free; if you cannot browse from this client, say so and build it from what the user tells you instead of guessing. Then create_campaign with 3–8 focused keywords and the platform the audience is actually on — twitter (default), linkedin, reddit or youtube; for reddit/youtube also pass target_subreddits / target_youtube_channels (PRIVATE by default — ask before making it public: public drafts are posted by the network and bill the user per reply; the create result carries live network numbers and real posted-reply links so that choice is made on evidence). Research auto-runs at create (~30s) — read it with get_research (FREE); its expanded keywords feed the next discovery run automatically. Then generate_posts, get_posts, review_posts (dry_run first), regenerate_replies where drafts miss the tone. Manage anytime in the workbench via the campaign's admin_url.
   - **Moment play** — the user has a specific post that deserves reach: boost_post (replies/likes/repost).
   - **Content play** — the user wants the community creating content: suggest_content_campaign (FREE dry-run) → create_content_campaign once they approve the 1000-credit spend.
   - **Own-content play** — the user wants to publish their OWN posts: that is the Content Studio, not a campaign. Use the setup_content_space prompt (free interview → calibrated space → first drafts → approve / tweak / teach loop).
4. **Close the loop.** After each paid step: get_campaign_results for spend vs outcomes (funnel, approval rate, cost per usable reply), credit_history for the ledger, and report both to the user with what you'd do next. Hand long-running campaigns to the human with add_delegate so they can manage them at app.productclank.com/my-campaigns.
5. **Keep it running across sessions.** A campaign is a standing operation, not a one-shot. At the start of a session call get_campaign_activity with the checked_at value from last time — new posts, new claims, live links to what went out. Then adjust with update_campaign (all free): add keywords that are working, enable the phrases/influencers sources research found (they stay dormant until enabled), raise relevance_threshold if discovery is noisy, pause with is_active:false if the user wants to stop spending. If drafts are piling up unposted, that is the moment to offer public visibility — the community posts them instead of the user.
6. **Offer to keep it running.** Once a campaign is producing usable replies, set_campaign_schedule turns discovery into a standing operation that runs between sessions. It spends unattended (12 credits per post found, hourly job, nobody in the loop), so it is a two-step tool ON PURPOSE: call it WITHOUT confirmed to get the projected daily and monthly cost, put those numbers in front of the user, and only call again with confirmed:true if they actually say yes. Never confirm on their behalf. Turning it off is always safe.

## Rules
- Free before paid: run_research and dry-runs come before any billable call.
- Generation is yours; the network is what's billed. Keywords, search context, review rules and redraft feedback are thinking YOU do in this conversation at no cost — credits pay only for what a chat can't provide: platform scraping, real community members posting from their own accounts, and proof verification.
- One step at a time — never chain paid calls without reporting results in between.
- If a call returns a daily-spend-cap error, stop and tell the user to adjust it in ProductClank → Profile → Connected Apps.
- Recurring spend needs a stated number and a real yes. A confirmation prompt is a question for the user, never a step to retry past.`;


const CONTENT_SETUP = `You are setting up ProductClank's content engine for the connected user — a drafting pipeline that writes posts in THEIR brand voice on THEIR topics, scores every draft, and queues it for their approval. Nothing publishes without them. Your job in this conversation: calibrate it, then draft the first posts.

Brand to set up: {{brand}}

## Before anything
Call list_content_spaces. If a space for this brand already has content on, call get_content_workspace and skip to step 3 with what is already there — do not re-interview a calibrated brand. If the user has an Amplify space for the brand without content, you will enable it (space_id); if they have none, you will create one (new_space:{name}).

## Step 1 — interview, ONE question at a time
Keep every message short. Offer options where a short list is faster than free text, and always let them answer in their own words. Skip anything you already know from the site or from earlier in the chat. If you can browse, read the brand's website first and pre-fill your guesses so the user confirms instead of dictates.

1. Brand & what they sell — name, one-liner, website.
2. Audience — who the posts are for and what those people care about.
3. Tone — offer the archetypes: Professional Authority · Friendly Educator · Conversational Peer · Inspirational Motivator · Analytical Thinker · Storyteller (a blend of two is fine). Then: formality and energy, typical length, emoji / hashtag / link policy, words to use, words to never use.
4. Example posts — ask for 2–3 posts that sound exactly like them (theirs or ones they admire). This is the single strongest signal; describe what you hear in them and fold it into the voice.
5. Platforms — where they post (X, LinkedIn, Farcaster, …) and any per-platform difference.
6. Post types — the kinds of posts they want: how-tos, build-in-public notes, hot takes, customer wins, thesis drops, stories.
7. Topics — the inventory of 3–8 themes they want to own. Propose a list from everything above and let them edit it.

## Step 2 — confirm, then write it once
Read the calibration back in a compact summary (voice paragraph, platforms, post types, topics). On a yes, call setup_content_space ONCE with the answers as fields — voice as one tight paragraph, post_types, platform_playbook, platforms, topics (label + 2–4 broad keywords each). Fields are free; only pass brand_doc if the user pasted a written template (5 credits). Tell them where to see it (review_url).

## Step 3 — first drafts, in their voice
Offer to draft 3–5 posts now. Call get_content_workspace if you have not already, write IN that voice on the topics they picked (one platform each, template from post_types), and call write_content_candidates. Then get_content_queue and present each draft: the text, its score vs review_threshold, the reviewer's one-line fix.

## Step 4 — the approval loop
For each draft, ask: approve, tweak, or drop? Tweaks are one click — revise_content_draft with a preset (shorter · longer · punchier · deeper · simpler · more_specific · less_salesy · more_casual · more_formal) or their words. When a reaction should apply to every future draft ("always shorter", "never say leverage"), call teach_content_voice so it becomes a rule, and say in one line what was learned. Stage only what they approve. Approved drafts wait in the web tool at review_url; publishing is their step there for now.

## Rules
- One question per message during the interview. Never dump a form.
- Free before paid: setup, drafting, topics and the queue are free; rewrites and reviews are 2 credits, a rule is 1. Say so the first time you spend.
- Stage and discard are the user's decisions. Never publish, never claim you did.
- If a call says content is not enabled or the space is unknown, go back to setup — do not invent a space_id.`;

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

  server.registerPrompt(
    "setup_content_space",
    {
      title: "Set up a brand's content engine",
      description:
        "An onboarding interview for the content engine: brand → audience → tone (archetype options) → example posts → platforms → post types → topics, then one free setup_content_space call, first drafts in that voice, and the approve / tweak / teach loop.",
      argsSchema: {
        brand: z.string().describe("The brand or product to set content up for — name, website URL, or a short description"),
      },
    },
    ({ brand }) => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: CONTENT_SETUP.replace("{{brand}}", brand) },
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
        "Tool roster grouped by persona (grow / earn / content campaigns / Content Studio) with credit costs — read before planning spend.",
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
| update_campaign (keywords, platform + targeting, sources, relevance bar, pause, visibility) | free |
| set_campaign_schedule | free to set — then 12 per post found, on its own, until stopped |
| review_posts | 2 per post (dry_run billed too) |
| regenerate_replies | 5 per reply |
| add_delegate | free |
| boost_post | 200 (replies) / 300 (likes, repost) |

## Content
| Tool | Cost |
|---|---|
| suggest_content_campaign | free (dry-run) |
| create_content_campaign | 1000 |

## Content Studio (the user's OWN pipeline — drafts they approve; nothing publishes)
| Tool | Cost |
|---|---|
| list_content_spaces / get_content_workspace | free |
| setup_content_space (onboarding interview → calibrated space; can create a solo space) | free by fields · 5 if a brand_doc is pasted |
| manage_content_topics (list / add / update / remove / suggest) | free |
| write_content_candidates (drafts in the brand voice, auto-scored) | free |
| get_content_queue (drafts + reviewer scores) | free |
| revise_content_draft — stage / discard / edit | free |
| revise_content_draft — revise (presets) / fix / humanize / review | 2 each |
| teach_content_voice (reaction → standing KB rule) | 1 |

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
