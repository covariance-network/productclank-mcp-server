/**
 * Posts (read) — the public replies under any post. Wraps
 * POST /agents/posts/replies (X only for now; Monid twitterdata.io upstream).
 * Billed per page of up to 100 replies actually read (1 credit each).
 */

import { request } from "./client.js";

export interface PostReply {
  id: string;
  url: string;
  text: string;
  created_at: string | null;
  lang: string | null;
  author: {
    id: string | null;
    username: string | null;
    name: string | null;
    avatar_url: string | null;
  };
  engagement: {
    likes: number;
    replies: number;
    reposts: number;
    views: number | null;
  };
  media: { type: string; url: string }[];
}

export interface PostRepliesResult {
  success: boolean;
  platform: "twitter";
  post: { id: string; url: string };
  replies: PostReply[];
  count: number;
  has_more: boolean;
  next_cursor: string | null;
  credits: { credits_used: number; credits_remaining: number; billing_user_id: string };
}

export function getPostReplies(
  userId: string,
  body: { url: string; limit?: number; cursor?: string }
): Promise<PostRepliesResult> {
  return request(userId, "/agents/posts/replies", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
