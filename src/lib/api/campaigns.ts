/**
 * Campaigns — full lifecycle of Communiply discovery campaigns.
 *
 * Wraps /agents/campaigns/** — create (10 cr), list/get/posts (free),
 * research (free, cached 7 days), generate-posts (12 cr/post),
 * review-posts (2 cr/post), regenerate-replies (5 cr/reply), delegates (free).
 * Every call authenticates as the acting user's own per-user agent (see
 * client.ts) — the key itself scopes access; no caller_user_id is sent.
 */

import { request } from "./client.js";

export interface CampaignSummary {
  id: string;
  campaign_number: string | null;
  title: string | null;
  status: string | null;
  is_active: boolean | null;
  campaign_type: string | null;
  boost_action_type: string | null;
  product_id: string | null;
  created_at: string | null;
  url: string;
  admin_url: string;
}

export interface CreateCampaignParams {
  callerUserId: string;
  productId: string;
  title: string;
  keywords: string[];
  searchContext: string;
  mentionAccounts?: string[];
  replyStyleTags?: string[];
  replyLength?: "very-short" | "short" | "medium" | "long" | "mixed";
  replyPostedBy?: "brand" | "community";
  replyGuidelines?: string;
  minFollowerCount?: number;
  maxPostAgeDays?: number;
  /** private = drafts stay in the owner's workbench; public = community earn
   *  feed distribution (network replies bill the owner). */
  visibility?: "public" | "private";
  /** Which network discovery works. NOT `sources` — see updateCampaign. */
  platform?: CampaignPlatform;
  /** Reddit only. Bare names or "r/x"; omit for all of Reddit. */
  targetSubreddits?: string[];
  /** YouTube only. Handles, ids or URLs; omit for keyword search alone. */
  targetYoutubeChannels?: string[];
}

/**
 * The four networks a campaign can work. Each has its own discovery pipeline
 * and reply shape. TikTok is absent on purpose: its proof is screenshot-only
 * and agents have no upload path, so offering it would let an agent set up
 * work it cannot complete.
 */
export type CampaignPlatform = "twitter" | "linkedin" | "reddit" | "youtube";

export function createCampaign(params: CreateCampaignParams): Promise<{
  success: boolean;
  campaign: CampaignSummary & { keywords: string[] };
  credits: { credits_used: number; credits_remaining: number };
  platform_note?: string;
  targeting_notes?: string[];
  next_step?: unknown;
}> {
  return request(params.callerUserId, "/agents/campaigns", {
    method: "POST",
    body: JSON.stringify({
      product_id: params.productId,
      title: params.title,
      keywords: params.keywords,
      search_context: params.searchContext,
      ...(params.mentionAccounts ? { mention_accounts: params.mentionAccounts } : {}),
      ...(params.replyStyleTags ? { reply_style_tags: params.replyStyleTags } : {}),
      ...(params.replyLength ? { reply_length: params.replyLength } : {}),
      ...(params.replyPostedBy ? { reply_posted_by: params.replyPostedBy } : {}),
      ...(params.replyGuidelines ? { reply_guidelines: params.replyGuidelines } : {}),
      ...(params.minFollowerCount != null ? { min_follower_count: params.minFollowerCount } : {}),
      ...(params.maxPostAgeDays != null ? { max_post_age_days: params.maxPostAgeDays } : {}),
      ...(params.visibility ? { visibility: params.visibility } : {}),
      ...(params.platform ? { platform: params.platform } : {}),
      ...(params.targetSubreddits ? { target_subreddits: params.targetSubreddits } : {}),
      ...(params.targetYoutubeChannels
        ? { target_youtube_channels: params.targetYoutubeChannels }
        : {}),
    }),
  });
}

export function listCampaigns(params: {
  callerUserId: string;
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<{ success: boolean; campaigns: CampaignSummary[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  if (params.status) qs.set("status", params.status);
  return request(params.callerUserId, `/agents/campaigns?${qs.toString()}`, { method: "GET" });
}

export function getCampaign(params: {
  callerUserId: string;
  campaignId: string;
}): Promise<{ success: boolean; campaign: Record<string, unknown>; stats: Record<string, unknown> }> {
  const qs = new URLSearchParams();
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}?${qs.toString()}`, { method: "GET" });
}

export function getPosts(params: {
  callerUserId: string;
  campaignId: string;
  limit?: number;
  offset?: number;
  status?: string;
  includeReplies?: boolean;
}): Promise<{ success: boolean; posts: unknown[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  if (params.status) qs.set("status", params.status);
  if (params.includeReplies === false) qs.set("include_replies", "false");
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}/posts?${qs.toString()}`, { method: "GET" });
}

export function generatePosts(params: {
  callerUserId: string;
  campaignId: string;
}): Promise<Record<string, unknown>> {
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}/generate-posts`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * Research response also reports which findings the campaign is actually
 * searching — `active_sources` plus the `dormant_until_enabled` list — so the
 * tool can offer to switch the unused ones on rather than silently reporting
 * findings that discovery ignores.
 */
export interface ResearchResponse extends Record<string, unknown> {
  analysis?: Record<string, unknown>;
  active_sources?: string[];
  applied_automatically?: string[];
  dormant_until_enabled?: { source: string; finding: string }[];
}

export function runResearch(params: {
  callerUserId: string;
  campaignId: string;
  force?: boolean;
}): Promise<ResearchResponse> {
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}/research`, {
    method: "POST",
    body: JSON.stringify({
      ...(params.force ? { force: true } : {}),
    }),
  });
}

export function getResearch(params: {
  callerUserId: string;
  campaignId: string;
}): Promise<ResearchResponse> {
  const qs = new URLSearchParams();
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}/research?${qs.toString()}`, { method: "GET" });
}

export function reviewPosts(params: {
  callerUserId: string;
  campaignId: string;
  reviewRules?: string;
  threshold?: number;
  dryRun?: boolean;
  saveRules?: boolean;
}): Promise<Record<string, unknown>> {
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}/review-posts`, {
    method: "POST",
    body: JSON.stringify({
      ...(params.reviewRules ? { review_rules: params.reviewRules } : {}),
      ...(params.threshold != null ? { threshold: params.threshold } : {}),
      dry_run: params.dryRun ?? false,
      ...(params.saveRules != null ? { save_rules: params.saveRules } : {}),
    }),
  });
}

export function regenerateReplies(params: {
  callerUserId: string;
  campaignId: string;
  postIds: string[];
  editRequest: string;
  applyToSystemPrompt?: boolean;
  newReplyGuidelines?: string;
}): Promise<Record<string, unknown>> {
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}/regenerate-replies`, {
    method: "POST",
    body: JSON.stringify({
      post_ids: params.postIds,
      edit_request: params.editRequest,
      ...(params.applyToSystemPrompt ? { apply_to_system_prompt: true } : {}),
      ...(params.newReplyGuidelines ? { new_reply_guidelines: params.newReplyGuidelines } : {}),
    }),
  });
}

export function addDelegate(params: {
  callerUserId: string;
  campaignId: string;
  userId: string;
}): Promise<{ success: boolean; message?: string }> {
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}/delegates`, {
    method: "POST",
    body: JSON.stringify({
      user_id: params.userId,
    }),
  });
}

export interface UpdateCampaignParams {
  callerUserId: string;
  campaignId: string;
  addKeywords?: string[];
  removeKeywords?: string[];
  /** enabled_verticals: keywords | phrases | influencers | lists | competitors */
  sources?: string[];
  monitorAccounts?: string[];
  relevanceThreshold?: number;
  isActive?: boolean;
  visibility?: "public" | "private";
  /** Only accepted while the campaign has discovered nothing — 409 after that. */
  platform?: CampaignPlatform;
  /** Replace-semantics; [] clears back to "search the whole platform". */
  targetSubreddits?: string[];
  targetYoutubeChannels?: string[];
}

/**
 * PATCH the campaign's live configuration. Free. Only the fields present are
 * touched, and keywords MERGE rather than replace — an agent adding a keyword
 * must never silently drop the ones already working.
 */
export function updateCampaign(params: UpdateCampaignParams): Promise<{
  success: boolean;
  campaign: Record<string, unknown> & { admin_url: string };
  changed: Record<string, unknown>;
  posts_visibility_updated?: number;
  platform_note?: string;
  targeting_notes?: string[];
  next_step?: string;
}> {
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(params.addKeywords ? { add_keywords: params.addKeywords } : {}),
      ...(params.removeKeywords ? { remove_keywords: params.removeKeywords } : {}),
      ...(params.sources ? { sources: params.sources } : {}),
      ...(params.monitorAccounts ? { monitor_accounts: params.monitorAccounts } : {}),
      ...(params.relevanceThreshold != null
        ? { relevance_threshold: params.relevanceThreshold }
        : {}),
      ...(params.isActive != null ? { is_active: params.isActive } : {}),
      ...(params.visibility ? { visibility: params.visibility } : {}),
      ...(params.platform ? { platform: params.platform } : {}),
      ...(params.targetSubreddits !== undefined
        ? { target_subreddits: params.targetSubreddits }
        : {}),
      ...(params.targetYoutubeChannels !== undefined
        ? { target_youtube_channels: params.targetYoutubeChannels }
        : {}),
    }),
  });
}

export interface CampaignActivity {
  success: boolean;
  campaign: Record<string, unknown>;
  since: string;
  /** Pass this back as `since` on the next check. */
  checked_at: string;
  summary: {
    new_posts: number;
    replies_claimed: number;
    replies_posted: number;
    engagement_drawn: { likes: number; replies: number };
    quiet: boolean;
  };
  new_posts: unknown[];
  claimed_replies: unknown[];
}

/** Free, no scraping — what changed since `since` (default 24h). */
export function getCampaignActivity(params: {
  callerUserId: string;
  campaignId: string;
  since?: string;
  limit?: number;
}): Promise<CampaignActivity> {
  const qs = new URLSearchParams();
  if (params.since) qs.set("since", params.since);
  if (params.limit != null) qs.set("limit", String(params.limit));
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}/activity?${qs.toString()}`, {
    method: "GET",
  });
}

export interface CampaignResults {
  success: boolean;
  campaign: Record<string, unknown>;
  funnel: Record<string, number>;
  rates: Record<string, number | null>;
  survival: Record<string, unknown>;
  engagement: Record<string, unknown>;
  spend: {
    credits_spent: number;
    by_operation: Record<string, number>;
    usable_replies: number;
    credits_per_usable_reply: number | null;
    credits_per_post_discovered: number | null;
    note: string;
  };
}

/** Free — spend vs outcomes, computed from stored columns (never Apify). */
export function getCampaignResults(params: {
  callerUserId: string;
  campaignId: string;
}): Promise<CampaignResults> {
  const qs = new URLSearchParams();
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}/results?${qs.toString()}`, {
    method: "GET",
  });
}

/**
 * Standing discovery — the only thing the connector can switch on that keeps
 * spending after the conversation ends.
 *
 * Two backend behaviours the caller must respect rather than route around:
 *  - `enabled:true` without `confirm:true` returns 400 `confirmation_required`
 *    carrying the projection. That is not an error to retry past; it is the
 *    user's decision point.
 *  - The per-app daily spend cap is enforced HERE as a ceiling (429
 *    `daily_spend_cap_exceeded`), because scheduled runs bill the campaign
 *    owner directly and never pass through the per-request cap.
 */
export interface ScheduleProjection {
  runs_per_day: number;
  posts_per_run: number;
  max_posts_per_day: number;
  credits_per_post: number;
  projected_daily_credits: number;
  projected_monthly_credits: number;
  days_of_runway: number | null;
  is_upper_bound: true;
  notes: string[];
}

export interface ScheduleState {
  enabled: boolean;
  frequency_per_day: number | null;
  posts_per_run: number | null;
  next_run: string | null;
  last_run: string | null;
}

export interface CampaignScheduleResponse {
  success: boolean;
  campaign?: Record<string, unknown>;
  schedule: ScheduleState;
  projection?: ScheduleProjection;
  credit_balance?: number | null;
  daily_spend_limit_credits?: number | null;
  limits?: Record<string, unknown>;
  /** Reasons an enabled schedule would not actually fire. Relay these. */
  blockers?: string[];
  changed?: Record<string, unknown>;
  message?: string;
}

/** Free — current schedule, projected cost, balance, cap, limits, blockers. */
export function getCampaignSchedule(params: {
  callerUserId: string;
  campaignId: string;
}): Promise<CampaignScheduleResponse> {
  const qs = new URLSearchParams();
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}/schedule?${qs.toString()}`, {
    method: "GET",
  });
}

export function setCampaignSchedule(params: {
  callerUserId: string;
  campaignId: string;
  enabled: boolean;
  frequencyPerDay?: number;
  postsPerRun?: number;
  /** Must be true to ENABLE. Never send it unless the user actually said yes. */
  confirm?: boolean;
}): Promise<CampaignScheduleResponse> {
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}/schedule`, {
    method: "PUT",
    body: JSON.stringify({
      enabled: params.enabled,
      ...(params.frequencyPerDay != null
        ? { frequency_per_day: params.frequencyPerDay }
        : {}),
      ...(params.postsPerRun != null ? { posts_per_run: params.postsPerRun } : {}),
      ...(params.confirm ? { confirm: true } : {}),
    }),
  });
}
