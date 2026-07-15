/**
 * Boost — rally the community to engage with a specific social post.
 * Wraps POST /agents/campaigns/boost (200–300 credits).
 */

import { request } from "./client.js";

export interface BoostParams {
  callerUserId: string;
  postUrl: string;
  productId: string;
  actionType: "replies" | "likes" | "repost";
  replyGuidelines?: string;
}

export interface BoostResult {
  success: boolean;
  campaign: {
    id: string;
    campaign_number: string;
    platform: string;
    action_type: string;
    is_reboost: boolean;
    url: string;
    admin_url: string;
  };
  post: { url: string; author: string; platform: string; text: string };
  items_generated: number;
  credits: { credits_used: number; credits_remaining: number };
}

export function boostPost(params: BoostParams): Promise<BoostResult> {
  return request("/agents/campaigns/boost", {
    method: "POST",
    body: JSON.stringify({
      caller_user_id: params.callerUserId,
      post_url: params.postUrl,
      product_id: params.productId,
      action_type: params.actionType,
      ...(params.replyGuidelines
        ? { reply_guidelines: params.replyGuidelines }
        : {}),
    }),
  });
}
