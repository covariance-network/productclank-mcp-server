/**
 * Campaigns — full lifecycle of Communiply discovery campaigns.
 *
 * Wraps /agents/campaigns/** — create (10 cr), list/get/posts (free),
 * research (free, cached 7 days), generate-posts (12 cr/post),
 * review-posts (2 cr/post), regenerate-replies (5 cr/reply), delegates (free).
 * Every call passes caller_user_id: the backend scopes trusted-agent campaigns
 * per user (creator_id), so one connector user can never touch another's.
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
}

export function createCampaign(params: CreateCampaignParams): Promise<{
  success: boolean;
  campaign: CampaignSummary & { keywords: string[] };
  credits: { credits_used: number; credits_remaining: number };
  next_step?: unknown;
}> {
  return request("/agents/campaigns", {
    method: "POST",
    body: JSON.stringify({
      caller_user_id: params.callerUserId,
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
    }),
  });
}

export function listCampaigns(params: {
  callerUserId: string;
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<{ success: boolean; campaigns: CampaignSummary[]; total: number }> {
  const qs = new URLSearchParams({ caller_user_id: params.callerUserId });
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  if (params.status) qs.set("status", params.status);
  return request(`/agents/campaigns?${qs.toString()}`, { method: "GET" });
}

export function getCampaign(params: {
  callerUserId: string;
  campaignId: string;
}): Promise<{ success: boolean; campaign: Record<string, unknown>; stats: Record<string, unknown> }> {
  const qs = new URLSearchParams({ caller_user_id: params.callerUserId });
  return request(`/agents/campaigns/${params.campaignId}?${qs.toString()}`, { method: "GET" });
}

export function getPosts(params: {
  callerUserId: string;
  campaignId: string;
  limit?: number;
  offset?: number;
  status?: string;
  includeReplies?: boolean;
}): Promise<{ success: boolean; posts: unknown[]; total: number }> {
  const qs = new URLSearchParams({ caller_user_id: params.callerUserId });
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  if (params.status) qs.set("status", params.status);
  if (params.includeReplies === false) qs.set("include_replies", "false");
  return request(`/agents/campaigns/${params.campaignId}/posts?${qs.toString()}`, { method: "GET" });
}

export function generatePosts(params: {
  callerUserId: string;
  campaignId: string;
}): Promise<Record<string, unknown>> {
  return request(`/agents/campaigns/${params.campaignId}/generate-posts`, {
    method: "POST",
    body: JSON.stringify({ caller_user_id: params.callerUserId }),
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
  return request(`/agents/campaigns/${params.campaignId}/research`, {
    method: "POST",
    body: JSON.stringify({
      caller_user_id: params.callerUserId,
      ...(params.force ? { force: true } : {}),
    }),
  });
}

export function getResearch(params: {
  callerUserId: string;
  campaignId: string;
}): Promise<ResearchResponse> {
  const qs = new URLSearchParams({ caller_user_id: params.callerUserId });
  return request(`/agents/campaigns/${params.campaignId}/research?${qs.toString()}`, { method: "GET" });
}

export function reviewPosts(params: {
  callerUserId: string;
  campaignId: string;
  reviewRules?: string;
  threshold?: number;
  dryRun?: boolean;
  saveRules?: boolean;
}): Promise<Record<string, unknown>> {
  return request(`/agents/campaigns/${params.campaignId}/review-posts`, {
    method: "POST",
    body: JSON.stringify({
      caller_user_id: params.callerUserId,
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
  return request(`/agents/campaigns/${params.campaignId}/regenerate-replies`, {
    method: "POST",
    body: JSON.stringify({
      caller_user_id: params.callerUserId,
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
  return request(`/agents/campaigns/${params.campaignId}/delegates`, {
    method: "POST",
    body: JSON.stringify({
      caller_user_id: params.callerUserId,
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
  next_step?: string;
}> {
  return request(`/agents/campaigns/${params.campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({
      caller_user_id: params.callerUserId,
      ...(params.addKeywords ? { add_keywords: params.addKeywords } : {}),
      ...(params.removeKeywords ? { remove_keywords: params.removeKeywords } : {}),
      ...(params.sources ? { sources: params.sources } : {}),
      ...(params.monitorAccounts ? { monitor_accounts: params.monitorAccounts } : {}),
      ...(params.relevanceThreshold != null
        ? { relevance_threshold: params.relevanceThreshold }
        : {}),
      ...(params.isActive != null ? { is_active: params.isActive } : {}),
      ...(params.visibility ? { visibility: params.visibility } : {}),
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
  const qs = new URLSearchParams({ caller_user_id: params.callerUserId });
  if (params.since) qs.set("since", params.since);
  if (params.limit != null) qs.set("limit", String(params.limit));
  return request(`/agents/campaigns/${params.campaignId}/activity?${qs.toString()}`, {
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
  const qs = new URLSearchParams({ caller_user_id: params.callerUserId });
  return request(`/agents/campaigns/${params.campaignId}/results?${qs.toString()}`, {
    method: "GET",
  });
}
