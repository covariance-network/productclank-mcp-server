/**
 * MCP tools for the ProductClank connector (boost MVP).
 *
 * The connected user's ProductClank id is resolved from the OAuth access token
 * by the requireBearerAuth middleware and surfaces here at
 * `extra.authInfo.extra.userId`. Every write bills that user's own credits via
 * the trusted-agent `caller_user_id` path.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/productclank-api.js";
import { getUserCreditBalance } from "../lib/credits.js";

interface ToolExtra {
  authInfo?: { extra?: Record<string, unknown> };
}

function getUserId(extra: ToolExtra): string | null {
  const id = extra.authInfo?.extra?.userId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function textResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

const NOT_AUTHED =
  "Not connected to a ProductClank account. Ask the user to connect the ProductClank connector.";

export function registerTools(server: McpServer): void {
  // ─── search_products (read) ──────────────────────────────────────────────
  server.registerTool(
    "search_products",
    {
      title: "Search ProductClank products",
      description:
        "Search the user's ProductClank products by name and return their IDs. A product_id is required to boost a post — use this to resolve it, then confirm the match with the user before boosting.",
      inputSchema: {
        query: z.string().describe("Product name or keyword to search for"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Max results (default 5)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit }, extra) => {
      if (!getUserId(extra as ToolExtra)) return errorResult(NOT_AUTHED);
      try {
        const result = await api.searchProducts(query, limit ?? 5);
        return textResult(result.products ?? []);
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Product search failed"
        );
      }
    }
  );

  // ─── check_balance (read) ────────────────────────────────────────────────
  server.registerTool(
    "check_balance",
    {
      title: "Check credit balance",
      description:
        "Return the connected user's ProductClank credit balance and plan. Use before boosting to confirm they have enough credits (a reply boost costs 200; likes and reposts cost 300).",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const { balance, plan } = await getUserCreditBalance(userId);
        return textResult({ balance, plan });
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Balance lookup failed"
        );
      }
    }
  );

  // ─── boost_post (write / destructive: spends credits) ────────────────────
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
