/**
 * Campaigns domain — the full "grow this product" loop.
 *
 * create_campaign (10 cr) → run_research (free) → generate_posts (12 cr/post)
 * → get_posts (free) → review_posts (2 cr/post) → regenerate_replies (5 cr/reply)
 * → add_delegate (free, hands the campaign to a human in the webapp).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, NOT_AUTHED, type ToolExtra } from "./_shared.js";

export function registerCampaignTools(server: McpServer): void {
  server.registerTool(
    "create_campaign",
    {
      title: "Create a discovery campaign",
      description:
        "Create a Communiply discovery campaign: it continuously finds relevant social posts (by keyword) and drafts replies that mention the product. Costs 10 credits to create; discovering posts is billed separately via generate_posts (12 credits/post). Needs a product_id (search_products / create_product). Defaults to PRIVATE: drafts stay in the user's workbench for their own review and posting. Set visibility:'public' ONLY if the user explicitly wants the ProductClank community to claim and post the replies for them — public drafts enter the earn feed immediately and each network-posted reply bills the user additional credits. Topic research auto-runs in the background at create (~30s); read it with get_research before spending on generate_posts. Confirm the credit cost with the user before calling.",
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
        visibility: z
          .enum(["public", "private"])
          .optional()
          .describe(
            "Default private (drafts stay in the user's workbench). public = the community earn feed distributes the drafts and network members post them, billing the user per posted reply — ask the user before choosing public."
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
        });
        return textResult({
          campaign: result.campaign,
          credits: result.credits,
          next_step:
            "Topic research is computing in the background (~30s). Call get_research to read the expanded keywords and competitor angles before spending credits on generate_posts.",
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
        "FREE pre-flight before spending credits: analyzes the campaign's keywords/topic and returns expanded keywords, high-intent phrases, influencer accounts, relevant X lists, and competitors. The EXPANDED KEYWORDS are automatically used by the next generate_posts run — no extra step. Account/phrase monitoring sources are NOT settable via this connector; if the analysis suggests them, tell the user they can optionally add sources later in the workbench (admin_url) — do not treat it as a required step. Cached for 7 days — pass force:true to refresh.",
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
        return textResult(await api.runResearch({ callerUserId: userId, campaignId: campaign_id, force }));
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Research failed");
      }
    }
  );

  server.registerTool(
    "get_research",
    {
      title: "Read cached campaign research",
      description: "Read the cached topic/competitor analysis for a campaign (from run_research). Free.",
      inputSchema: { campaign_id: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ campaign_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult(await api.getResearch({ callerUserId: userId, campaignId: campaign_id }));
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
        return textResult(await api.generatePosts({ callerUserId: userId, campaignId: campaign_id }));
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
        return textResult(
          await api.reviewPosts({
            callerUserId: userId,
            campaignId: campaign_id,
            reviewRules: review_rules,
            threshold,
            dryRun: dry_run,
          })
        );
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
