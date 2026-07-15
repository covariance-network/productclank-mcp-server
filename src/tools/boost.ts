/**
 * Boost domain — rally the community to engage with a specific social post.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, NOT_AUTHED, type ToolExtra } from "./_shared.js";

export function registerBoostTools(server: McpServer): void {
  server.registerTool(
    "boost_post",
    {
      title: "Boost a social post",
      description:
        "Rally the ProductClank community to engage with a specific social post. Creates a boost campaign and spends the user's credits: 'replies' generates 10 AI reply drafts (200 credits); 'likes' (30 likes) and 'repost' (10 reposts) cost 300. Supports Twitter/X, Instagram, TikTok, LinkedIn, Reddit, and Farcaster — the platform is auto-detected from the URL. Requires a product_id from search_products. Confirm the action and its credit cost with the user before calling.",
      inputSchema: {
        post_url: z
          .string()
          .url()
          .describe("Full URL of the post to boost (any supported platform)"),
        product_id: z.string().describe("Product UUID from search_products"),
        action_type: z
          .enum(["replies", "likes", "repost"])
          .optional()
          .describe(
            "How the community engages. Default: replies. Reposts are Twitter/Farcaster only."
          ),
        reply_guidelines: z
          .string()
          .optional()
          .describe(
            "Optional guidance for the tone and content of community replies"
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async ({ post_url, product_id, action_type, reply_guidelines }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.boostPost({
          callerUserId: userId,
          postUrl: post_url,
          productId: product_id,
          actionType: action_type ?? "replies",
          replyGuidelines: reply_guidelines,
        });
        return textResult({
          campaign_url: result.campaign.url,
          campaign_number: result.campaign.campaign_number,
          platform: result.campaign.platform,
          action_type: result.campaign.action_type,
          items_generated: result.items_generated,
          credits_used: result.credits.credits_used,
          credits_remaining: result.credits.credits_remaining,
          is_reboost: result.campaign.is_reboost,
        });
      } catch (error) {
        // Surface actionable API errors (e.g. insufficient credits) verbatim.
        return errorResult(
          error instanceof Error ? error.message : "Boost failed"
        );
      }
    }
  );
}
