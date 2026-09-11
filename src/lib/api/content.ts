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
 * getContentCampaignResults reads back what the campaign produced (GET).
 * Winner selection still happens in the ProductClank web app.
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
    /** Public, on-brand editorial page to share with the community. */
    public_url: string;
    /** Per-campaign management page (review submissions, pick winners). */
    admin_url: string;
  };
  credits: {
    credits_used: number;
    credits_remaining: number;
    billing_user_id: string;
  };
  next_step?: {
    action?: string;
    public_url?: string;
    admin_url?: string;
    description?: string;
  };
}

function buildBody(params: ContentCampaignParams, dryRun: boolean) {
  return {
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
  return request(params.callerUserId, "/agents/campaigns/content", {
    method: "POST",
    body: JSON.stringify(buildBody(params, true)),
  });
}

/** dry_run: false — creates + auto-activates the campaign, charges 1000 credits. */
export function createContentCampaign(
  params: ContentCampaignParams
): Promise<CreateContentCampaignResult> {
  return request(params.callerUserId, "/agents/campaigns/content", {
    method: "POST",
    body: JSON.stringify(buildBody(params, false)),
  });
}

/* ── Results ─────────────────────────────────────────────────────────────── */

export interface ContentCampaignSubmission {
  id: string;
  /** The published post. Null while a participant has submitted an image only. */
  post_url: string | null;
  image_url: string | null;
  description: string | null;
  submission_type: string | null;
  status: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  points_allocated: number | null;
  created_at: string | null;
  creator: {
    user_id: string;
    name: string | null;
    avatar: string | null;
    fid: number | null;
    x_username: string | null;
  };
}

export interface ContentCampaignResults {
  success: boolean;
  campaign: {
    id: string;
    campaign_number: number;
    title: string | null;
    description: string | null;
    product_id: string | null;
    /**
     * Derived lifecycle — use this, never `raw_status`. "processing" means the
     * AI brief is still generating and the campaign is not live yet.
     */
    state: "processing" | "active" | "paused" | "ended" | "cancelled";
    state_label: string;
    is_accepting_submissions: boolean;
    raw_status: string | null;
    start_date: string | null;
    end_date: string | null;
    reward_type: string | null;
    participants_count: number | null;
    public_url: string;
  };
  counts: { total: number; pending: number; approved: number; rejected: number };
  submissions: ContentCampaignSubmission[];
  winners: {
    id: string;
    user_id: string;
    submission_id: string | null;
    winner_type: string | null;
    reward_amount: number | null;
  }[];
  pagination: {
    limit: number;
    offset: number;
    returned: number;
    total_matching: number;
    has_more: boolean;
  };
}

export interface ContentCampaignResultsParams {
  callerUserId: string;
  /** Campaign UUID or its public campaign number. */
  campaignId: string;
  /** Filter submissions by review state. */
  status?: "pending" | "approved" | "rejected";
  limit?: number;
  offset?: number;
}

/**
 * Read what a content campaign actually produced. Free, read-only.
 * Wraps GET /api/v1/agents/campaigns/content/[campaignId].
 */
export function getContentCampaignResults(
  params: ContentCampaignResultsParams
): Promise<ContentCampaignResults> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  const qs = query.toString();

  return request(
    params.callerUserId,
    `/agents/campaigns/content/${encodeURIComponent(params.campaignId)}${qs ? `?${qs}` : ""}`,
    { method: "GET" }
  );
}
