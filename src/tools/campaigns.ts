/**
 * Campaigns domain — the full "grow this product" loop.
 *
 * create_campaign (10 cr) → run_research (free) → generate_posts (12 cr/post)
 * → get_posts (free) → review_posts (2 cr/post) → regenerate_replies (5 cr/reply)
 * → add_delegate (free, hands the campaign to a human in the webapp).
 *
 * And the operate half, all free: get_campaign_activity (what's new since the
 * last check) → get_campaign_results (spend vs outcomes) → update_campaign
 * (keywords, sources, relevance bar, pause, visibility).
 *
 * Visibility is the one decision the owner must actually make, so it travels
 * with the results as a `decision_offer` (see ./_shared.ts) rather than only in
 * a tool description the user never sees.
 */

/**
 * The distribution choice, offered rather than warned about: private is the
 * default because it is reversible and cheap, but community distribution is the
 * product's actual value — an agent that never surfaces it leaves the campaign
 * as a drafts folder.
 */
function distributionOffer(isPublic: boolean, adminUrl: string): DecisionOffer {
  return {
    question:
      "Who posts these replies — you, or the ProductClank community?",
    options: [
      {
        choice: "You post them (private)",
        what_happens:
          "Drafts stay in the workbench; the user reviews and posts the ones they like from their own accounts. Nothing goes out on its own.",
        cost: "No extra credits beyond discovery (12 credits per post found).",
      },
      {
        choice: "The community posts them for you (public)",
        what_happens:
          "The drafts enter the ProductClank earn feed, where network members claim them and post from their own accounts — real reach without the user doing the posting. The user reviews the proof of each posted reply in the workbench.",
        cost: "Credits per network-posted reply, on top of discovery.",
      },
    ],
    current: isPublic
      ? "The community posts them for you (public)"
      : "You post them (private)",
    how_to_apply: `Ask the user which they want, then call update_campaign with the matching \`visibility\` — it takes effect immediately, including for drafts already found. They can also toggle it in the workbench: ${adminUrl}`,
  };
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { ApiError } from "../lib/api/client.js";
import {
  getUserId,
  textResult,
  errorResult,
  NOT_AUTHED,
  type ToolExtra,
  type DecisionOffer,
} from "./_shared.js";

/**
 * Research writes findings; only the enabled sources read them. Expanded
 * keywords and exclude terms apply on their own, but phrases, key accounts,
 * lists and competitors sit unused until their source is switched on — which
 * an agent has no reason to mention unless the result says so. Hence: report
 * what is dormant, and offer to turn it on.
 */
interface SourceStatus {
  active_sources?: string[];
  dormant_until_enabled?: { source: string; finding: string }[];
  analysis?: Record<string, unknown>;
}

function dormantFindings(result: SourceStatus): { source: string; count: number }[] {
  const analysis = result.analysis ?? {};
  return (result.dormant_until_enabled ?? [])
    .map((entry) => {
      const found = analysis[entry.finding];
      return { source: entry.source, count: Array.isArray(found) ? found.length : 0 };
    })
    .filter((entry) => entry.count > 0);
}

function researchResult(result: SourceStatus & Record<string, unknown>) {
  const dormant = dormantFindings(result);
  if (dormant.length === 0) {
    return textResult({
      ...result,
      user_note:
        "The expanded keywords and exclusion terms from this analysis are applied automatically on the next generate_posts run — nothing else to switch on.",
    });
  }
  // "1 competitors" reads like a bug in the middle of an offer.
  const summary = dormant
    .map((d) => `${d.count} ${d.count === 1 ? d.source.replace(/s$/, "") : d.source}`)
    .join(", ");
  return textResult({
    ...result,
    user_note: `The expanded keywords and exclusion terms apply automatically. But this analysis also found ${summary} that the campaign is NOT using — those sources are switched off, so discovery ignores them. Tell the user what was found and offer to turn them on; it is free and takes one call.`,
    decision_offer: {
      question: `Research found ${summary} the campaign isn't searching. Turn those on?`,
      options: [
        {
          choice: `Turn on ${dormant.map((d) => d.source).join(" + ")}`,
          what_happens:
            "Discovery starts searching those sources as well as keywords — usually more posts, and different ones (people the product's audience follows, phrases they actually use).",
          cost: "Free to enable. The next generate_posts run still costs 12 credits per post it finds, and finding more posts means it finds more.",
        },
        {
          choice: "Keep it keyword-only",
          what_happens:
            "Discovery stays narrow and predictable. The findings stay saved and can be enabled any time.",
          cost: "Nothing.",
        },
      ],
      current: `Active sources: ${(result.active_sources ?? ["keywords"]).join(", ")}`,
      how_to_apply:
        "Call update_campaign with sources: [\"keywords\", …the ones they approved].",
    },
  });
}

/**
 * The backend refuses to enable a schedule without an explicit yes and returns
 * 400 `confirmation_required` with the cost projection attached. Recognising
 * that shape is what lets the tool present it as a decision instead of an error.
 */
interface ConfirmationRequiredBody {
  error: "confirmation_required";
  projection: {
    runs_per_day: number;
    posts_per_run: number;
    projected_daily_credits: number;
    projected_monthly_credits: number;
    days_of_runway: number | null;
    notes?: string[];
  };
  credit_balance?: number | null;
  daily_spend_limit_credits?: number | null;
  proposed?: unknown;
  current?: unknown;
  limits?: unknown;
  blockers?: string[];
}

function isConfirmationRequired(body: unknown): body is ConfirmationRequiredBody {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { error?: unknown }).error === "confirmation_required" &&
    typeof (body as { projection?: unknown }).projection === "object" &&
    (body as { projection?: unknown }).projection !== null
  );
}

export function registerCampaignTools(server: McpServer): void {
  server.registerTool(
    "create_campaign",
    {
      title: "Create a discovery campaign",
      description:
        "Create a Communiply discovery campaign: it continuously finds relevant social posts (by keyword) and drafts replies that mention the product. Costs 10 credits to create; discovering posts is billed separately via generate_posts (12 credits/post). Needs a product_id (search_products / create_product). Two ways to run it, and the user picks: PRIVATE (the default here) keeps drafts in their workbench to review and post themselves — reversible, no further cost; PUBLIC puts the drafts in the ProductClank earn feed so community members post them from their own accounts — that is the reach the platform exists for, and each network-posted reply bills the user extra credits. Default to private when the user has not said, and relay the decision_offer in the result so they can choose. Pick the `platform` the product's audience actually talks on — X (default), LinkedIn, Reddit or YouTube — and for Reddit/YouTube narrow it with target_subreddits / target_youtube_channels. Topic research auto-runs in the background at create (~30s); read it with get_research before spending on generate_posts. Confirm the credit cost with the user before calling.",
      inputSchema: {
        product_id: z.string().describe("Product UUID (from search_products or create_product)"),
        title: z.string().describe("Campaign title, e.g. 'Grow Acme — AI devtools conversations'"),
        keywords: z
          .array(z.string())
          .min(1)
          .max(20)
          .describe("Search keywords/phrases to discover posts with (3–8 focused phrases work best)"),
        search_context: z
          .string()
          .describe("One or two sentences on what conversations to find and why the product is relevant to them"),
        mention_accounts: z
          .array(z.string())
          .optional()
          .describe("X handles to mention naturally in replies (e.g. the product's account)"),
        reply_style_tags: z
          .array(z.string())
          .optional()
          .describe("Tone tags for drafted replies, e.g. ['helpful', 'builder-to-builder']"),
        reply_length: z.enum(["very-short", "short", "medium", "long", "mixed"]).optional(),
        reply_guidelines: z
          .string()
          .optional()
          .describe("Custom guidelines for reply drafting (defaults are built from the campaign context)"),
        platform: z
          .enum(["twitter", "linkedin", "reddit", "youtube"])
          .optional()
          .describe(
            "Which network to work: twitter (default), linkedin, reddit, youtube. This is WHERE discovery looks — distinct from `sources` in update_campaign, which is HOW it looks there. Pick from where the product's audience actually is; it is fixed once the campaign discovers its first post."
          ),
        target_subreddits: z
          .array(z.string())
          .max(25)
          .optional()
          .describe(
            "Reddit only, and enforced server-side: sending this on a non-Reddit campaign is REJECTED with an error, never silently ignored. Subreddits to rotate through, with or without the 'r/' prefix. Omit to search all of Reddit. Note Reddit allows at most one posted reply per subreddit per day, so breadth beats depth here."
          ),
        target_youtube_channels: z
          .array(z.string())
          .max(25)
          .optional()
          .describe(
            "YouTube only, and enforced server-side: sending this on a non-YouTube campaign is REJECTED with an error, never silently ignored. Channel handles, ids or URLs to pull recent videos from, alongside the keyword search. Omit for keyword search alone."
          ),
        visibility: z
          .enum(["public", "private"])
          .optional()
          .describe(
            "Who posts the drafted replies. private (default) = they wait in the user's workbench for the user to post; public = the community earn feed distributes them and network members post them, billing the user per posted reply. Reversible either way — ask the user rather than assuming."
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.createCampaign({
          callerUserId: userId,
          productId: args.product_id,
          title: args.title,
          keywords: args.keywords,
          searchContext: args.search_context,
          mentionAccounts: args.mention_accounts,
          replyStyleTags: args.reply_style_tags,
          replyLength: args.reply_length,
          replyGuidelines: args.reply_guidelines,
          visibility: args.visibility ?? "private",
          platform: args.platform,
          targetSubreddits: args.target_subreddits,
          targetYoutubeChannels: args.target_youtube_channels,
        });
        const isPublic = (args.visibility ?? "private") === "public";
        return textResult({
          campaign: result.campaign,
          credits: result.credits,
          visibility: isPublic ? "public" : "private",
          platform: args.platform ?? "twitter",
          ...(result.platform_note ? { platform_note: result.platform_note } : {}),
          ...(result.targeting_notes ? { targeting_notes: result.targeting_notes } : {}),
          next_step:
            "Topic research is computing in the background (~30s). Call get_research to read the expanded keywords and competitor angles before spending credits on generate_posts.",
          user_note: isPublic
            ? "This campaign is PUBLIC: once posts are discovered, the drafted replies go into the ProductClank earn feed and community members can claim and post them. Each network-posted reply costs credits, and the proof of every one shows up in the workbench for review."
            : "This campaign is PRIVATE: drafted replies land in the user's workbench and nothing is posted anywhere until they post it. If they'd rather not do the posting themselves, the community can do it for them — offer the choice below.",
          decision_offer: distributionOffer(isPublic, result.campaign.admin_url),
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Campaign creation failed");
      }
    }
  );

  server.registerTool(
    "list_campaigns",
    {
      title: "List the user's campaigns",
      description:
        "List discovery/boost campaigns the connected user created through this connector, newest first. Free. Use to find a campaign id before get_campaign / generate_posts / get_posts.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Default 20"),
        offset: z.number().int().min(0).optional(),
        status: z.enum(["active", "paused", "completed"]).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ limit, offset, status }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.listCampaigns({ callerUserId: userId, limit, offset, status });
        return textResult({ campaigns: result.campaigns, total: result.total });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Listing campaigns failed");
      }
    }
  );

  server.registerTool(
    "get_campaign",
    {
      title: "Get campaign details & stats",
      description:
        "Get one campaign's configuration (keywords, search context, reply settings) plus live stats: posts discovered, replies by status. Free. Use to check progress after generate_posts or before adjusting the campaign.",
      inputSchema: {
        campaign_id: z.string().describe("Campaign UUID (from list_campaigns or create_campaign)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ campaign_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.getCampaign({ callerUserId: userId, campaignId: campaign_id });
        return textResult({ campaign: result.campaign, stats: result.stats });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Campaign fetch failed");
      }
    }
  );

  server.registerTool(
    "run_research",
    {
      title: "Research the campaign's topic (free)",
      description:
        "FREE pre-flight before spending credits: analyzes the campaign's keywords/topic and returns expanded keywords, high-intent phrases, influencer accounts, relevant X lists, and competitors. The EXPANDED KEYWORDS and exclusion terms are applied automatically by the next generate_posts run. Everything else is NOT: phrases, influencer accounts, lists and competitors are only searched once their source is enabled — the result reports which are dormant, and update_campaign (free) switches them on. Cached for 7 days — pass force:true to refresh.",
      inputSchema: {
        campaign_id: z.string(),
        force: z.boolean().optional().describe("Force a fresh analysis even if a cached one exists"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ campaign_id, force }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return researchResult(
          await api.runResearch({ callerUserId: userId, campaignId: campaign_id, force })
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Research failed");
      }
    }
  );

  server.registerTool(
    "get_research",
    {
      title: "Read cached campaign research",
      description:
        "Read the cached topic/competitor analysis for a campaign (from run_research). Free. Also reports which of its findings the campaign is actually searching: expanded keywords and exclusion terms always apply, while phrases / influencer accounts / lists / competitors stay dormant until their source is enabled via update_campaign.",
      inputSchema: { campaign_id: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ campaign_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return researchResult(
          await api.getResearch({ callerUserId: userId, campaignId: campaign_id })
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Research fetch failed");
      }
    }
  );

  server.registerTool(
    "generate_posts",
    {
      title: "Discover posts & draft replies",
      description:
        "Run the campaign's discovery pipeline: scrapes social platforms for posts matching the keywords and drafts a community reply for each. Costs 12 credits PER POST discovered (a typical run finds 5–20 posts, so 60–240 credits) and can take a few minutes. Check check_balance first and confirm the spend with the user. Then use get_posts to read results and review_posts to prune irrelevant ones.",
      inputSchema: { campaign_id: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ campaign_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.generatePosts({ callerUserId: userId, campaignId: campaign_id });
        return textResult({
          ...result,
          user_note:
            "Nothing has been posted. On a private campaign (the default here) these drafts sit in the workbench until the user posts them; on a public one they enter the community earn feed. Read them with get_posts, prune with review_posts, and redraft with regenerate_replies before anything goes out.",
          next_step:
            "get_posts (free) to read what was found, then review_posts with dry_run:true to see which are worth keeping.",
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Post generation failed");
      }
    }
  );

  server.registerTool(
    "get_posts",
    {
      title: "Read discovered posts & reply drafts",
      description:
        "Read a campaign's discovered posts with their drafted replies. Free. Use after generate_posts to inspect what was found, then review_posts / regenerate_replies to refine.",
      inputSchema: {
        campaign_id: z.string(),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50"),
        offset: z.number().int().min(0).optional(),
        status: z.enum(["filtered", "discovered", "rejected"]).optional(),
        include_replies: z.boolean().optional().describe("Default true"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ campaign_id, limit, offset, status, include_replies }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult(
          await api.getPosts({
            callerUserId: userId,
            campaignId: campaign_id,
            limit,
            offset,
            status,
            includeReplies: include_replies,
          })
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Posts fetch failed");
      }
    }
  );

  server.registerTool(
    "review_posts",
    {
      title: "AI-review posts for relevance",
      description:
        "Score every discovered post against relevancy rules and delete the irrelevant ones (kept when dry_run:true). Costs 2 credits per post reviewed — dry runs are billed too, since the AI review runs either way. Start with dry_run:true to preview the verdicts, then re-run with dry_run:false to prune. Confirm the spend with the user.",
      inputSchema: {
        campaign_id: z.string(),
        review_rules: z
          .string()
          .optional()
          .describe("Relevancy rules, e.g. 'Keep only posts where the author has a real problem our product solves'. Falls back to rules saved on the campaign."),
        threshold: z.number().int().min(1).max(10).optional().describe("Delete posts scoring below this (default 5)"),
        dry_run: z.boolean().optional().describe("Preview verdicts without deleting (default false; still billed)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ campaign_id, review_rules, threshold, dry_run }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.reviewPosts({
          callerUserId: userId,
          campaignId: campaign_id,
          reviewRules: review_rules,
          threshold,
          dryRun: dry_run,
        });
        // A dry run has already been paid for and changed nothing — say so, and
        // say what the second (free-of-new-review) decision is.
        return dry_run
          ? textResult({
              ...result,
              user_note:
                "Preview only — nothing was deleted, but the review was still billed (2 credits per post, since the AI scored them either way). Tell the user how many posts scored badly and what the reasons were.",
              next_step:
                "If the verdicts look right, re-run review_posts with the same rules and dry_run:false to actually remove the irrelevant posts (billed again, 2 credits per post). If they look wrong, adjust review_rules or the threshold instead — or skip pruning entirely.",
            })
          : textResult(result);
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Post review failed");
      }
    }
  );

  server.registerTool(
    "regenerate_replies",
    {
      title: "Regenerate reply drafts with feedback",
      description:
        "Redraft the replies of specific posts with an edit request (e.g. 'shorter, no emojis, lead with the user's problem'). Costs 5 credits per reply regenerated; already-claimed replies are refused. Get post ids from get_posts. Confirm the spend with the user.",
      inputSchema: {
        campaign_id: z.string(),
        post_ids: z.array(z.string()).min(1).max(50).describe("Post UUIDs whose replies to redraft"),
        edit_request: z.string().describe("How the replies should change"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ campaign_id, post_ids, edit_request }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult(
          await api.regenerateReplies({
            callerUserId: userId,
            campaignId: campaign_id,
            postIds: post_ids,
            editRequest: edit_request,
          })
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Reply regeneration failed");
      }
    }
  );

  server.registerTool(
    "get_campaign_activity",
    {
      title: "What's new on a campaign",
      description:
        "Catch up on a campaign since the last check: posts discovered, replies claimed by community members, LIVE links to what they actually posted, and the engagement those replies drew. Free, and it never scrapes — safe to call at the start of every session. Pass `since` (the `checked_at` from the previous call) to get only what is new; omit it for the last 24 hours. Use this to resume a standing growth operation across chats, then get_campaign_results for the cumulative picture.",
      inputSchema: {
        campaign_id: z.string(),
        since: z
          .string()
          .optional()
          .describe("ISO 8601 timestamp — the `checked_at` returned by the previous call. Default: 24 hours ago."),
        limit: z.number().int().min(1).max(100).optional().describe("Items per list, default 20"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ campaign_id, since, limit }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.getCampaignActivity({
          callerUserId: userId,
          campaignId: campaign_id,
          since,
          limit,
        });
        const { summary } = result;
        return textResult({
          ...result,
          user_note: summary.quiet
            ? "Nothing new since the last check — no posts discovered and no replies claimed. That is normal for a private campaign between discovery runs; it is worth looking at only if it keeps repeating after a generate_posts run."
            : `Since the last check: ${summary.new_posts} new post(s) found and ${summary.replies_claimed} reply(ies) claimed, ${summary.replies_posted} of them already posted. Give the user the live links (posted_url) — those are real replies on their behalf.`,
          next_step:
            "Pass `checked_at` back as `since` next time so this stays a running log rather than a repeat.",
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Activity fetch failed");
      }
    }
  );

  server.registerTool(
    "get_campaign_results",
    {
      title: "Campaign results & cost per usable reply",
      description:
        "The cumulative scorecard for a campaign: the funnel (posts discovered → kept → replies drafted → claimed → posted → approved), the approval rate, whether posted replies survived on-platform, the engagement they drew, total credits spent broken down by operation, and the cost per usable reply. Free, and it never scrapes — unlike the web report it costs nothing to poll. Use it to answer 'is this working and what am I paying for it?'.",
      inputSchema: { campaign_id: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ campaign_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.getCampaignResults({
          callerUserId: userId,
          campaignId: campaign_id,
        });
        const perReply = result.spend.credits_per_usable_reply;
        return textResult({
          ...result,
          user_note:
            perReply != null
              ? `${result.spend.credits_spent} credits spent so far, ${result.spend.usable_replies} usable replies out of it — about ${perReply} credits each. Report the funnel honestly: the approval and survival rates below cover only what has actually been judged or checked.`
              : `${result.spend.credits_spent} credits spent so far, with no usable replies yet. Say so plainly rather than reporting the raw counts as success — if posts were found but nothing was posted, the campaign is private and waiting on the user (or on the community, if they want to open it up).`,
          reading_guide:
            "approval_rate is over judged replies only (see approval_sample); survival_rate is null until enough replies were checked; engagement covers only swept replies. A removed reply is usually a moderator decision, not fraud.",
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Results fetch failed");
      }
    }
  );

  server.registerTool(
    "update_campaign",
    {
      title: "Tune a running campaign",
      description:
        "Adjust a live campaign without recreating it. Free — nothing here spends credits, though the next generate_posts run bills as usual. Keywords MERGE (add_keywords never drops what is already there). `sources` is how research findings get applied: high-intent phrases, influencer accounts and lists that run_research found stay dormant until you enable their source. `relevance_threshold` moves the bar the relevance gate keeps posts above (new campaigns start lenient at 5; raise it when discovery is noisy). `is_active:false` pauses discovery so nothing more is found or billed. `visibility` decides who posts the drafts — flipping to 'public' also releases the already-discovered drafts to the community, so only do it when the user has said yes. `target_subreddits` / `target_youtube_channels` re-aim discovery within its platform (send an empty array to clear and search the whole platform). `platform` itself can only change while the campaign has discovered nothing — after that it is fixed, and a second campaign is the answer. Changes apply to the NEXT generate_posts run; existing posts are not re-scored.",
      inputSchema: {
        campaign_id: z.string(),
        add_keywords: z
          .array(z.string())
          .optional()
          .describe("Keywords to add — merged with the existing list, duplicates ignored"),
        remove_keywords: z.array(z.string()).optional().describe("Keywords to drop (at least one must remain)"),
        sources: z
          .array(z.enum(["keywords", "phrases", "influencers", "lists", "competitors"]))
          .optional()
          .describe(
            "Which discovery sources run. 'keywords' is always included. Enable 'phrases'/'influencers'/'lists'/'competitors' to actually USE what run_research found — they do nothing until enabled."
          ),
        monitor_accounts: z
          .array(z.string())
          .optional()
          .describe("Specific handles the influencers source should watch; enables that source automatically"),
        relevance_threshold: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Keep only posts scoring at or above this on semantic relevance (new campaigns start at 5)"),
        is_active: z.boolean().optional().describe("false pauses discovery, true resumes it"),
        visibility: z
          .enum(["public", "private"])
          .optional()
          .describe(
            "Who posts the drafted replies. private = the user posts them from the workbench; public = the community earn feed distributes them and members post them, billing the user per posted reply. Ask first."
          ),
        platform: z
          .enum(["twitter", "linkedin", "reddit", "youtube"])
          .optional()
          .describe(
            "Which network discovery works. Only changeable while the campaign has discovered nothing — otherwise it returns platform_locked, because switching would mix two platforms' posts and proof rules in one campaign."
          ),
        target_subreddits: z
          .array(z.string())
          .max(25)
          .optional()
          .describe("Reddit only, enforced server-side — sending it on a non-Reddit campaign is REJECTED, not ignored. REPLACES the list rather than appending; [] clears it and searches all of Reddit. To add one, read the current list with get_campaign first and send the full merged list."),
        target_youtube_channels: z
          .array(z.string())
          .max(25)
          .optional()
          .describe("YouTube only, enforced server-side — sending it on a non-YouTube campaign is REJECTED, not ignored. REPLACES the list rather than appending; [] clears it and runs keyword search alone. To add one, read the current list with get_campaign first and send the full merged list."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.updateCampaign({
          callerUserId: userId,
          campaignId: args.campaign_id,
          addKeywords: args.add_keywords,
          removeKeywords: args.remove_keywords,
          sources: args.sources,
          monitorAccounts: args.monitor_accounts,
          relevanceThreshold: args.relevance_threshold,
          isActive: args.is_active,
          visibility: args.visibility,
          platform: args.platform,
          targetSubreddits: args.target_subreddits,
          targetYoutubeChannels: args.target_youtube_channels,
        });

        const notes: string[] = [];
        if (args.visibility === "public") {
          notes.push(
            `The campaign is now public: ${result.posts_visibility_updated ?? 0} existing draft(s) were released to the community earn feed, where members can claim and post them. Each posted reply bills credits, and the proof of every one shows up in the workbench for review.`
          );
        } else if (args.visibility === "private") {
          notes.push(
            `The campaign is now private: ${result.posts_visibility_updated ?? 0} draft(s) were pulled from the community feed. Replies already claimed stay claimed — this only stops new ones.`
          );
        }
        if (args.is_active === false) {
          notes.push("Discovery is paused — nothing new will be found or billed until it is resumed.");
        }
        if (result.targeting_notes?.length) {
          notes.push(result.targeting_notes.join(" "));
        }
        if (result.platform_note) {
          notes.push(result.platform_note);
        }
        if (args.sources && args.sources.length > 1) {
          notes.push(
            "The new sources take effect on the next generate_posts run, which will cost 12 credits per post it finds."
          );
        }

        return textResult({
          ...result,
          ...(notes.length > 0 ? { user_note: notes.join(" ") } : {}),
          ...(args.visibility === undefined
            ? {
                decision_offer: distributionOffer(
                  (result.campaign.visibility as string) === "public",
                  result.campaign.admin_url
                ),
              }
            : {}),
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Campaign update failed");
      }
    }
  );

  server.registerTool(
    "set_campaign_schedule",
    {
      title: "Put discovery on a schedule",
      description:
        "Turn standing discovery on or off for a campaign. Calling this is free, but switching it ON authorizes spend that happens LATER and unattended: an hourly job runs discovery on its own and bills the user 12 credits per post it finds, with nobody in the loop. So there are two steps and you must not skip the first. STEP 1 — call with enabled:true and NO confirmed flag: nothing is changed and you get back the projected daily and monthly cost, the balance, and how many days of runway that is. STEP 2 — show the user those numbers, get a real yes, then call again with confirmed:true. Never send confirmed:true on your own initiative, on an assumption, or because the user said something general like 'keep it going' — the user has to have seen a number. Turning it OFF (enabled:false) is always safe and needs no confirmation; do it whenever the user asks to stop. Limits on this path are deliberately lower than the website's: up to 4 runs/day, up to 20 posts/run, and never more than 600 projected credits/day. Read the current schedule with get_campaign.",
      inputSchema: {
        campaign_id: z.string(),
        enabled: z
          .boolean()
          .describe("true starts standing discovery, false stops it"),
        frequency_per_day: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe("Discovery runs per day (1-4). Defaults to the campaign's current setting, else 1."),
        posts_per_run: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Target posts per run (1-20). Defaults to the campaign's current setting, else 5. Each post found bills 12 credits."),
        confirmed: z
          .boolean()
          .optional()
          .describe(
            "Set true ONLY after the user has seen the projected cost from a previous call and explicitly agreed to it. Omit on the first call — that is what produces the projection."
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.setCampaignSchedule({
          callerUserId: userId,
          campaignId: args.campaign_id,
          enabled: args.enabled,
          frequencyPerDay: args.frequency_per_day,
          postsPerRun: args.posts_per_run,
          confirm: args.confirmed === true,
        });

        if (!args.enabled) {
          return textResult({
            ...result,
            user_note:
              "Standing discovery is off. Nothing more is found or billed on its own — generate_posts still works whenever the user asks for a run.",
          });
        }

        const blockers = result.blockers ?? [];
        return textResult({
          ...result,
          user_note: [
            `Standing discovery is now ON: up to ${result.schedule.posts_per_run} posts per run, ${result.schedule.frequency_per_day}x a day, billing 12 credits per post found — up to ${result.projection?.projected_daily_credits} credits a day. It keeps running after this conversation ends.`,
            "Tell the user how to stop it: ask you to turn it off, or toggle it in the workbench.",
            ...blockers,
          ].join(" "),
        });
      } catch (error) {
        // The confirmation gate is a DECISION, not a failure. The backend
        // refuses to enable without an explicit yes and hands back the cost
        // projection; surfacing that as an error would push an assistant to
        // retry past it instead of asking the person paying.
        if (
          error instanceof ApiError &&
          error.status === 400 &&
          isConfirmationRequired(error.body)
        ) {
          const body = error.body as ConfirmationRequiredBody;
          const p = body.projection;
          const runway =
            p.days_of_runway != null
              ? ` At the current balance of ${body.credit_balance ?? "unknown"} credits, that is about ${p.days_of_runway} day(s) of runway.`
              : "";
          return textResult({
            status: "confirmation_required",
            nothing_changed: true,
            projection: p,
            credit_balance: body.credit_balance ?? null,
            daily_spend_limit_credits: body.daily_spend_limit_credits ?? null,
            proposed: body.proposed,
            current: body.current,
            limits: body.limits,
            ...(body.blockers?.length ? { blockers: body.blockers } : {}),
            user_note: `Nothing has been scheduled yet. Running discovery ${p.runs_per_day}x a day at up to ${p.posts_per_run} posts per run would cost up to ${p.projected_daily_credits} credits a day (${p.projected_monthly_credits} a month) — a ceiling, not a forecast, since each run only bills the posts it actually finds.${runway} This keeps spending after the conversation ends, so ask the user directly and only call again with confirmed:true if they say yes.`,
            decision_offer: {
              question: `Run discovery on this campaign automatically, ${p.runs_per_day}x a day?`,
              options: [
                {
                  choice: "Yes, keep it running",
                  what_happens:
                    "Discovery runs on its own from now on, finding new conversations and drafting replies between sessions. It can be stopped any time, from chat or the workbench.",
                  cost: `Up to ${p.projected_daily_credits} credits a day (${p.projected_monthly_credits}/month) — only for posts it actually finds.`,
                },
                {
                  choice: "No, keep it manual",
                  what_happens:
                    "Nothing runs unless asked. Discovery happens only when generate_posts is called, so every credit is spent with the user present.",
                  cost: "Nothing until the next manual run.",
                },
              ],
              current: "Manual — no schedule is running.",
              how_to_apply:
                "If they say yes, call set_campaign_schedule again with the same frequency_per_day and posts_per_run plus confirmed:true.",
            },
          });
        }
        if (error instanceof ApiError && error.status === 429) {
          return errorResult(
            `${error.message} Nothing was scheduled. Either propose a smaller schedule, or ask the user to raise the limit for this app under Profile → Connected Apps.`
          );
        }
        return errorResult(
          error instanceof Error ? error.message : "Setting the schedule failed"
        );
      }
    }
  );

  server.registerTool(
    "add_delegate",
    {
      title: "Hand a campaign to a human",
      description:
        "Add a ProductClank user as a delegate on a campaign so they can view and manage it from the webapp's My Campaigns page. Free. Useful to hand oversight of an agent-created campaign to its human owner (the connected user's own id works too).",
      inputSchema: {
        campaign_id: z.string(),
        user_id: z.string().describe("ProductClank User id to grant webapp access to"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ campaign_id, user_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult(
          await api.addDelegate({ callerUserId: userId, campaignId: campaign_id, userId: user_id })
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Adding delegate failed");
      }
    }
  );
}
