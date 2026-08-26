/**
 * Participation — the connected user EARNS by doing campaign work.
 *
 * Wraps /agents/participate/** — feed (free), submit (earns points/credits),
 * earnings (free). Submissions are attributed to the acting user via their
 * own per-user agent key: the backend
 * author-matches the posted reply against THAT user's linked X handle
 * (UserSocial.twitter) and awards points/credits to them.
 */

import { request } from "./client.js";

export interface FeedReply {
  id: string;
  replyText: string;
  actionType: string;
}

export interface FeedPost {
  id: string;
  campaignId: string;
  campaign: {
    id: string;
    campaignNumber: string | null;
    title: string | null;
    productId: string | null;
  } | null;
  platform: string | null;
  tweetId: string | null;
  tweetUrl: string | null;
  tweetText: string | null;
  tweetCreatedAt: string | null;
  author: {
    username: string | null;
    displayName: string | null;
    followerCount: number;
    verified: boolean;
  };
  unclaimedReplies: FeedReply[];
}

/** `matching` = what the page returned after filtering; `total` counts posts
 *  with any unclaimed reply and is an upper bound. */
export function getParticipationFeed(params: {
  callerUserId: string;
  limit?: number;
  offset?: number;
  campaignId?: string;
  actionType?: "reply" | "like" | "repost";
}): Promise<{ success: boolean; posts: FeedPost[]; total: number; matching?: number }> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  if (params.campaignId) qs.set("campaignId", params.campaignId);
  if (params.actionType) qs.set("actionType", params.actionType);
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return request(params.callerUserId, `/agents/participate/feed${suffix}`, {
    method: "GET",
  });
}

export function submitParticipation(params: {
  callerUserId: string;
  replyId: string;
  replyUrl: string;
}): Promise<{
  success: boolean;
  message?: string;
  replyId?: string;
  pointsAwarded?: number;
  creditsAwarded?: number;
}> {
  return request(params.callerUserId, "/agents/participate/submit", {
    method: "POST",
    body: JSON.stringify({
      replyId: params.replyId,
      replyUrl: params.replyUrl,
    }),
  });
}

export interface EarningsResult {
  success: boolean;
  userId: string;
  points: number;
  credits: number;
  replies: {
    submitted: number;
    approved: number;
    rejected: number;
    strikes: number;
  };
  proClaim?: Record<string, unknown>;
}

export function getEarnings(params: {
  callerUserId: string;
}): Promise<EarningsResult> {
  const qs = new URLSearchParams();
  return request(params.callerUserId, `/agents/participate/earnings?${qs.toString()}`, { method: "GET" });
}

export function getCreditHistory(params: {
  callerUserId: string;
  limit?: number;
  offset?: number;
}): Promise<{ success: boolean; transactions: unknown[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return request(params.callerUserId, `/agents/credits/history?${qs.toString()}`, { method: "GET" });
}

// ── Content / take-action campaign participation ────────────────────────────
// Wraps /agents/participate/campaigns/** — discover briefs, submit proof,
// track review status. Submissions land PENDING; rewards ship when the
// campaign owner reviews/concludes.

export interface OpenCampaign {
  id: string;
  title: string | null;
  kind: "content" | "take_action";
  is_community: boolean;
  space_id: string | null;
  reward_type: string | null;
  reward_amount: number | null;
  end_date: string | null;
  participants_count: number;
  max_participants: number | null;
  action_message: string | null;
  description: string | null;
  url: string;
}

export function listOpenCampaigns(params: {
  callerUserId: string;
  limit?: number;
  kind?: "content" | "take_action";
}): Promise<{ success: boolean; campaigns: OpenCampaign[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.kind) qs.set("kind", params.kind);
  return request(params.callerUserId, `/agents/participate/campaigns?${qs.toString()}`, { method: "GET" });
}

export function getCampaignBrief(params: {
  callerUserId: string;
  campaignId: string;
}): Promise<{
  success: boolean;
  campaign: Record<string, unknown>;
  my_participation: { submissions_used: number; submissions_allowed: number };
}> {
  const qs = new URLSearchParams();
  return request(params.callerUserId, `/agents/participate/campaigns/${params.campaignId}?${qs.toString()}`, {
    method: "GET",
  });
}

export function submitCampaignWork(params: {
  callerUserId: string;
  campaignId: string;
  castUrl?: string;
  /** A hosted image or video the user produced for the task. Links only —
   *  the API stores URLs, it never accepts uploads. */
  mediaUrl?: string;
  description?: string;
}): Promise<{
  success: boolean;
  data: { submission: Record<string, unknown>; message: string };
}> {
  return request(params.callerUserId, `/agents/participate/campaigns/${params.campaignId}/submissions`, {
    method: "POST",
    body: JSON.stringify({
      ...(params.castUrl ? { cast_url: params.castUrl } : {}),
      ...(params.mediaUrl ? { media_url: params.mediaUrl } : {}),
      ...(params.description ? { description: params.description } : {}),
    }),
  });
}

export function getMyCampaignSubmissions(params: {
  callerUserId: string;
  campaignId: string;
}): Promise<{ success: boolean; submissions: unknown[]; total: number }> {
  const qs = new URLSearchParams();
  return request(params.callerUserId, 
    `/agents/participate/campaigns/${params.campaignId}/my-submissions?${qs.toString()}`,
    { method: "GET" }
  );
}
