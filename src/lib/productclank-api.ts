/**
 * Thin client for the ProductClank Agent REST API.
 *
 * Every call authenticates with the server's single *trusted* agent key
 * (PRODUCTCLANK_TRUSTED_KEY) and bills the end user via `caller_user_id`. The
 * trusted key is a server secret — it is never exposed to Claude or to users.
 */

import { config } from "../config.js";

const BASE = config.productclankApiUrl;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.trustedApiKey}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message?: unknown }).message)
        : `ProductClank API error ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

// ─── Authorization (trusted agent → user billing consent) ──────────────────

export function authorizeUser(
  userId: string
): Promise<{ success: boolean; authorized: boolean }> {
  return request("/agents/authorize", {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

// ─── Products ──────────────────────────────────────────────────────────────

export interface ProductSearchResult {
  success: boolean;
  products: Array<{
    id: string;
    name: string;
    tagline?: string;
    website?: string;
    twitter?: string;
    category?: string[];
  }>;
}

export function searchProducts(
  query: string,
  limit: number
): Promise<ProductSearchResult> {
  const qs = new URLSearchParams({ q: query, limit: String(limit) });
  return request(`/agents/products/search?${qs.toString()}`, { method: "GET" });
}

// ─── Boost ─────────────────────────────────────────────────────────────────

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
