/**
 * Content campaigns — rally the community to CREATE content for a product.
 * Wraps POST /api/v1/agents/campaigns/content (Growth Boost / take_action).
 *
 * One endpoint, two modes via `dry_run`:
 * - composeContentCampaign (dry_run: true)  → FREE AI-drafted proposal, no row,
 *   no charge. Used to preview a campaign for the user before launching.
 * - createContentCampaign  (dry_run: false) → creates + auto-activates the
 *   campaign and charges 1000 credits.
 *
 * Submissions and winner selection happen in the ProductClank web app (v1).
 */

import { request } from "./client.js";

export const CONTENT_CAMPAIGN_CREDITS = 1000;

export interface ContentCampaignParams {
  /** OAuth-resolved ProductClank user the campaign is billed to / owned by. */
  callerUserId: string;
  /** Product to run the campaign for (from searchProducts). */
  productId: string;
  /** The core brief — what the community should create. */
  campaignMessage: string;
  campaignGoals?: string[];
  targetAudience?: string;
  preferredPlatform?: string;
  additionalGuidelines?: string;
  references?: string;
}

/** The AI-composed campaign returned by a dry-run preview (never persisted). */
export interface ContentCampaignProposal {
  title: string;
  description: string;
  action_type: string;
  action_url: string;
  action_cta: string;
  action_message: string;
  eligibility_criteria?: string;
}

export interface ComposeContentCampaignResult {
  success: boolean;
  dry_run: true;
  proposal: ContentCampaignProposal;
  product: { id: string; name: string };
  credits_required: number;
  credits_available: number;
  can_afford: boolean;
  next_step?: { action?: string; endpoint?: string; description?: string };
}

export interface CreateContentCampaignResult {
  success: boolean;
  campaign: {
    id: string;
    campaign_number: number;
    title: string;
    product_id: string;
    campaign_type: string;
    status: string;
    admin_url: string;
  };
  credits: {
    credits_used: number;
    credits_remaining: number;
    billing_user_id: string;
  };
  next_step?: { action?: string; admin_url?: string; description?: string };
}

function buildBody(params: ContentCampaignParams, dryRun: boolean) {
  return {
    caller_user_id: params.callerUserId,
    product_id: params.productId,
    campaign_message: params.campaignMessage,
    dry_run: dryRun,
    ...(params.campaignGoals?.length ? { campaign_goals: params.campaignGoals } : {}),
    ...(params.targetAudience ? { target_audience: params.targetAudience } : {}),
    ...(params.preferredPlatform ? { preferred_platform: params.preferredPlatform } : {}),
    ...(params.additionalGuidelines
      ? { additional_guidelines: params.additionalGuidelines }
      : {}),
    ...(params.references ? { references: params.references } : {}),
  };
}

/** dry_run: true — FREE preview, no campaign created, no credits charged. */
export function composeContentCampaign(
  params: ContentCampaignParams
): Promise<ComposeContentCampaignResult> {
  return request("/agents/campaigns/content", {
    method: "POST",
    body: JSON.stringify(buildBody(params, true)),
  });
}

/** dry_run: false — creates + auto-activates the campaign, charges 1000 credits. */
export function createContentCampaign(
  params: ContentCampaignParams
): Promise<CreateContentCampaignResult> {
  return request("/agents/campaigns/content", {
    method: "POST",
    body: JSON.stringify(buildBody(params, false)),
  });
}
