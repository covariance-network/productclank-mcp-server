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
import {
  getUserId,
  textResult,
  errorResult,
  NOT_AUTHED,
  type ToolExtra,
  type DecisionOffer,
} from "./_shared.js";

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

/**
 * 1000 credits is the biggest single spend in the connector — it gets an
 * explicit yes/no put to the user, not a line in a tool description.
 */
function launchOffer(creditsRequired: number, creditsAvailable: number, canAfford: boolean): DecisionOffer {
  return {
    question: `Launch this content campaign for ${creditsRequired} credits?`,
    options: [
      {
        choice: "Launch it",
        what_happens:
          "The campaign goes live and auto-activates; the ProductClank community starts submitting content for it. Submissions and winner picking happen in the web app.",
        cost: canAfford
          ? `${creditsRequired} credits now (balance ${creditsAvailable} → ${creditsAvailable - creditsRequired}).`
          : `${creditsRequired} credits — the user only has ${creditsAvailable} and needs ${creditsRequired - creditsAvailable} more first.`,
      },
      {
        choice: "Change the brief first",
        what_happens:
          "Nothing is created. Adjust campaign_message / goals / audience and call suggest_content_campaign again for a new draft.",
        cost: "Free — previews are never billed.",
      },
    ],
    current: "Nothing created yet — this was a free preview.",
    how_to_apply:
      "Only call create_content_campaign after the user says yes to the credit cost.",
  };
}

export function registerContentTools(server: McpServer): void {
  // ─── suggest_content_campaign (free preview) ──────────────────────────────
  server.registerTool(
    "suggest_content_campaign",
    {
      title: "Preview a content campaign",
      description:
        "Preview a content campaign for a product BEFORE launching it. FREE — nothing is created and no credits are charged. Returns an AI-drafted campaign (title, description, call-to-action) plus whether the user can afford to launch it (1000 credits). Show the user the draft AND the credit cost, get an explicit yes, then call create_content_campaign — never launch off the back of the preview alone. Requires a product_id from search_products; write the campaign_message brief from what you know about the product.",
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
          user_note: result.can_afford
            ? `Preview only — nothing created, no credits charged. Launching costs ${result.credits_required} credits (the user has ${result.credits_available}). Show them the draft campaign and ask before spending it.`
            : `Preview only — nothing created, no credits charged. Launching costs ${result.credits_required} credits but the user only has ${result.credits_available}, so they'd need to top up first at https://app.productclank.com/credits.`,
          decision_offer: launchOffer(
            result.credits_required,
            result.credits_available,
            result.can_afford
          ),
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
        // Additive: creates a NEW content campaign; never deletes/overwrites
        // existing data. (Spends 1000 credits, but destructiveHint models data
        // destruction, not cost — the description handles the spend warning.)
        destructiveHint: false,
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
          // Public, shareable editorial page — give this to the user so they
          // can share the campaign; admin_url is where they manage it.
          public_url: result.campaign.public_url,
          admin_url: result.campaign.admin_url,
          credits_used: result.credits.credits_used,
          credits_remaining: result.credits.credits_remaining,
          note: "Campaign is generating its brief (usually ready in 2–5 minutes) and will auto-activate. Share public_url with the community; review submissions and pick winners at admin_url.",
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
