/**
 * MCP Tool definitions for ProductClank Communiply.
 *
 * Each tool wraps a ProductClank REST API endpoint.
 * The user's API key is resolved from the OAuth access token
 * stored in the MCP session context.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/productclank-api.js";

/**
 * Resolve the ProductClank API key from the request context.
 * In production this maps the OAuth access token → pck_live_* key.
 * For now, we pass the token directly (TODO: implement token→key mapping).
 */
function getApiKey(_extra: Record<string, unknown>): string {
  // TODO: Extract from OAuth session / token mapping
  // For now, use env var for testing
  const key = process.env.PRODUCTCLANK_API_KEY;
  if (!key) throw new Error("No API key available. User must authenticate.");
  return key;
}

export function registerTools(server: McpServer) {
  // ─── Search Products ───────────────────────────────────────────
  server.tool(
    "search_products",
    "Search for products on ProductClank by name. Returns product IDs needed for campaign creation.",
    { query: z.string().describe("Product name or keyword to search for") },
    async ({ query }, extra) => {
      const apiKey = getApiKey(extra as Record<string, unknown>);
      const result = await api.searchProducts(query, { apiKey });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── Create Campaign ──────────────────────────────────────────
  server.tool(
    "create_campaign",
    "Create a Communiply campaign to discover relevant Twitter/X conversations and generate authentic replies. Costs 10 credits. After creation, call generate_posts to trigger discovery.",
    {
      product_id: z.string().describe("Product UUID from search_products"),
      title: z.string().describe("Campaign name"),
      keywords: z
        .array(z.string())
        .describe("Keywords to monitor on Twitter/X"),
      search_context: z
        .string()
        .describe(
          "Description of target conversations, e.g. 'People discussing AI productivity tools'"
        ),
      mention_accounts: z
        .array(z.string())
        .optional()
        .describe("Twitter handles to mention (e.g. ['@productclank'])"),
      reply_style_tags: z
        .array(z.string())
        .optional()
        .describe("Tone tags, e.g. ['friendly', 'technical']"),
      reply_length: z
        .enum(["very-short", "short", "medium", "long", "mixed"])
        .optional()
        .describe("Desired reply length"),
      min_follower_count: z
        .number()
        .optional()
        .describe("Minimum follower count for target posts (default: 100)"),
      max_post_age_days: z
        .number()
        .optional()
        .describe("Maximum post age in days"),
      reply_guidelines: z
        .string()
        .optional()
        .describe("Custom instructions for AI reply generation"),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra as Record<string, unknown>);
      const result = await api.createCampaign(params, { apiKey });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── Generate Posts ────────────────────────────────────────────
  server.tool(
    "generate_posts",
    "Trigger Twitter/X discovery and reply generation for a campaign. Costs 12 credits per post discovered. Call after create_campaign.",
    {
      campaign_id: z.string().describe("Campaign UUID from create_campaign"),
    },
    async ({ campaign_id }, extra) => {
      const apiKey = getApiKey(extra as Record<string, unknown>);
      const result = await api.generatePosts(campaign_id, { apiKey });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── Get Campaign ─────────────────────────────────────────────
  server.tool(
    "get_campaign",
    "Get campaign details, stats, and post counts. Free.",
    {
      campaign_id: z.string().describe("Campaign UUID"),
    },
    async ({ campaign_id }, extra) => {
      const apiKey = getApiKey(extra as Record<string, unknown>);
      const result = await api.getCampaign(campaign_id, { apiKey });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── List Campaigns ───────────────────────────────────────────
  server.tool(
    "list_campaigns",
    "List your Communiply campaigns. Free.",
    {
      limit: z.number().optional().describe("Max results (default 20)"),
      status: z
        .enum(["active", "paused", "completed"])
        .optional()
        .describe("Filter by status"),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra as Record<string, unknown>);
      const result = await api.listCampaigns(params, { apiKey });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── Review Posts ─────────────────────────────────────────────
  server.tool(
    "review_posts",
    "AI-review discovered posts against custom relevancy rules. Irrelevant posts are deleted. Costs 2 credits per post.",
    {
      campaign_id: z.string().describe("Campaign UUID"),
      review_rules: z
        .string()
        .describe(
          "Rules for what makes a post relevant, e.g. 'Only keep posts where someone is asking for product recommendations'"
        ),
      threshold: z
        .number()
        .optional()
        .describe("Score threshold 1-10, posts below are irrelevant (default 5)"),
      dry_run: z
        .boolean()
        .optional()
        .describe("If true, preview which posts would be removed without deleting"),
      save_rules: z
        .boolean()
        .optional()
        .describe("Save rules to campaign for future use"),
    },
    async ({ campaign_id, ...rest }, extra) => {
      const apiKey = getApiKey(extra as Record<string, unknown>);
      const result = await api.reviewPosts(campaign_id, rest, { apiKey });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── Boost Tweet ──────────────────────────────────────────────
  server.tool(
    "boost_tweet",
    "Amplify a specific tweet with community engagement. 200 credits for replies (10 AI reply threads), 300 for likes/reposts.",
    {
      tweet_url: z.string().describe("Full Twitter/X URL of the tweet to boost"),
      product_id: z.string().describe("Product UUID"),
      action_type: z
        .enum(["replies", "likes", "repost"])
        .describe("Type of boost action"),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra as Record<string, unknown>);
      const result = await api.boostTweet(params, { apiKey });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── Check Credit Balance ─────────────────────────────────────
  server.tool(
    "check_balance",
    "Check your ProductClank credit balance. Free.",
    {},
    async (_params, extra) => {
      const apiKey = getApiKey(extra as Record<string, unknown>);
      const result = await api.getBalance({ apiKey });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── Credit History ───────────────────────────────────────────
  server.tool(
    "credit_history",
    "View credit transaction history. Free.",
    {
      limit: z.number().optional().describe("Max results (default 50)"),
    },
    async (params, extra) => {
      const apiKey = getApiKey(extra as Record<string, unknown>);
      const result = await api.getCreditHistory(params, { apiKey });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
