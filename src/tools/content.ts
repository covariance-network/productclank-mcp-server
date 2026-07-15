/**
 * Content-campaign domain — rally the community to CREATE content for a product.
 *
 * Two tools over one endpoint (POST /agents/campaigns/content):
 * - suggest_content_campaign → FREE AI-drafted preview (dry_run). Nothing is
 *   created and no credits are charged. Show it to the user for approval.
 * - create_content_campaign  → launches + auto-activates the campaign and
 *   charges 1000 credits.
 *
 * Submissions and winner selection happen in the ProductClank web app (v1).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, NOT_AUTHED, type ToolExtra } from "./_shared.js";

// Shared input schema for both content tools — you (the agent) write the brief
// from what you know about the product; the platform's AI expands it.
const contentInputSchema = {
  product_id: z.string().describe("Product UUID from search_products"),
  campaign_message: z
    .string()
    .describe(
      "The core brief: what you want the community to create (e.g. 'Share how you use <product> in your daily workflow')."
    ),
  campaign_goals: z
    .array(z.string())
    .optional()
    .describe('Campaign goals, e.g. ["awareness", "signups"]'),
  target_audience: z
    .string()
    .optional()
    .describe("Who the campaign should reach"),
  preferred_platform: z
    .string()
    .optional()
    .describe('Preferred platform, e.g. "x" or "farcaster"'),
  additional_guidelines: z
    .string()
    .optional()
    .describe("Extra do's/don'ts for creators"),
  references: z
    .string()
    .optional()
    .describe("Links or references to include in the campaign"),
};

type ContentArgs = {
  product_id: string;
  campaign_message: string;
  campaign_goals?: string[];
  target_audience?: string;
  preferred_platform?: string;
  additional_guidelines?: string;
  references?: string;
};

function toParams(userId: string, args: ContentArgs): api.ContentCampaignParams {
  return {
    callerUserId: userId,
    productId: args.product_id,
    campaignMessage: args.campaign_message,
    campaignGoals: args.campaign_goals,
    targetAudience: args.target_audience,
    preferredPlatform: args.preferred_platform,
    additionalGuidelines: args.additional_guidelines,
    references: args.references,
  };
}

export function registerContentTools(server: McpServer): void {
  // ─── suggest_content_campaign (free preview) ──────────────────────────────
  server.registerTool(
    "suggest_content_campaign",
    {
      title: "Preview a content campaign",
      description:
        "Preview a content campaign for a product BEFORE launching it. FREE — nothing is created and no credits are charged. Returns an AI-drafted campaign (title, description, call-to-action) plus whether the user can afford to launch it (1000 credits). Use this to show the user what the campaign would look like and get their approval, then call create_content_campaign. Requires a product_id from search_products; write the campaign_message brief from what you know about the product.",
      inputSchema: contentInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.composeContentCampaign(toParams(userId, args));
        return textResult({
          proposal: result.proposal,
          product: result.product,
          credits_required: result.credits_required,
          credits_available: result.credits_available,
          can_afford: result.can_afford,
          note: "Preview only — nothing created, no credits charged. Call create_content_campaign to launch.",
        });
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Content-campaign preview failed"
        );
      }
    }
  );

  // ─── create_content_campaign (write / spends 1000 credits) ────────────────
  server.registerTool(
    "create_content_campaign",
    {
      title: "Launch a content campaign",
      description:
        "Launch a content campaign: rally the ProductClank community to create content (posts, threads, videos) for a product. Spends 1000 credits. The platform's AI expands your brief into a full campaign and auto-activates it; community submissions and winner selection happen in the ProductClank web app. Requires a product_id from search_products. Preview with suggest_content_campaign and confirm the 1000-credit cost with the user before calling.",
      inputSchema: contentInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.createContentCampaign(toParams(userId, args));
        return textResult({
          campaign_id: result.campaign.id,
          campaign_number: result.campaign.campaign_number,
          title: result.campaign.title,
          status: result.campaign.status,
          admin_url: result.campaign.admin_url,
          credits_used: result.credits.credits_used,
          credits_remaining: result.credits.credits_remaining,
          note: "Campaign is generating its brief and will auto-activate. Review submissions and pick winners in the ProductClank web app.",
        });
      } catch (error) {
        // Surface actionable API errors (e.g. insufficient credits) verbatim.
        return errorResult(
          error instanceof Error ? error.message : "Content-campaign launch failed"
        );
      }
    }
  );
}
