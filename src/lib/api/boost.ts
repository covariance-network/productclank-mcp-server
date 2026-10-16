/**
 * Boost — rally the community to engage with a specific social post.
 * Wraps POST /agents/campaigns/boost (20 credits per reply/quote draft; 300 for likes/bookmarks/reposts).
 */

import { request } from "./client.js";
import type { WatchQuizInput, WatchQuizSummary } from "./watchQuiz.js";

export interface BoostParams {
  callerUserId: string;
  postUrl: string;
  /** Optional — link a product. Omit for a tweet-first boost. */
  productId?: string;
  actionType: "replies" | "likes" | "repost" | "quote" | "bookmarks";
  replyGuidelines?: string;
  /** replies / quote only: number of drafts, 1–10, billed 20 credits each. */
  count?: number;
  /** The post's text/caption, when the caller already has it — skips the server fetch. */
  postText?: string;
  /** Pace delivery over this many hours (1 now, the rest dripped hourly). Omit = all at once. */
  spreadOverHours?: number;
  /** "Watch & answer" on a TikTok / YouTube / Instagram Reel: a linked 24h watch quiz. */
  watchQuiz?: WatchQuizInput;
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
  items_expected?: number;
  generation?: "complete" | "processing";
  /** A brand-new TikTok whose caption isn't published yet — drafts (and the charge) follow. */
  waiting_for_post_text?: boolean;
  delivery?:
    | { mode: "immediate" }
    | { mode: "paced"; spread_over_hours: number; released_first: number; scheduled_later: number };
  message?: string;
  /** Present when watch_quiz was sent. `error` = the boost exists but the quiz does not. */
  watch_quiz?: Partial<WatchQuizSummary> & { campaign_id?: string; public_url?: string; error?: string };
  credits: { credits_used: number; credits_remaining: number; credits_pending?: number };
}

export function boostPost(params: BoostParams): Promise<BoostResult> {
  return request(params.callerUserId, "/agents/campaigns/boost", {
    method: "POST",
    body: JSON.stringify({
      post_url: params.postUrl,
      ...(params.productId ? { product_id: params.productId } : {}),
      action_type: params.actionType,
      ...(params.replyGuidelines
        ? { reply_guidelines: params.replyGuidelines }
        : {}),
      ...(params.count !== undefined ? { count: params.count } : {}),
      ...(params.postText ? { post_text: params.postText } : {}),
      ...(params.spreadOverHours !== undefined
        ? { spread_over_hours: params.spreadOverHours }
        : {}),
      ...(params.watchQuiz ? { watch_quiz: params.watchQuiz } : {}),
    }),
  });
}
