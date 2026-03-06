/**
 * ProductClank REST API client.
 * Wraps existing /api/v1/agents/* endpoints so MCP tool handlers
 * can call them with a user's API key.
 */

import { config } from "../config.js";

const BASE = config.productclankApiUrl;

interface ApiOptions {
  apiKey: string;
}

async function request<T>(
  path: string,
  opts: ApiOptions & RequestInit
): Promise<T> {
  const { apiKey, ...fetchOpts } = opts;
  const url = `${BASE}${path}`;

  const res = await fetch(url, {
    ...fetchOpts,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...((fetchOpts.headers as Record<string, string>) || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ProductClank API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// --- Agent ---

export function getAgentProfile(opts: ApiOptions) {
  return request("/agents/me", { ...opts, method: "GET" });
}

export function registerAgent(
  data: { name: string; description: string; wallet_address?: string },
  opts: ApiOptions
) {
  return request("/agents/register", {
    ...opts,
    method: "POST",
    body: JSON.stringify(data),
  });
}

// --- Products ---

export function searchProducts(query: string, opts: ApiOptions) {
  return request(
    `/agents/products/search?q=${encodeURIComponent(query)}`,
    { ...opts, method: "GET" }
  );
}

// --- Campaigns ---

export function createCampaign(
  data: {
    product_id: string;
    title: string;
    keywords: string[];
    search_context: string;
    mention_accounts?: string[];
    reply_style_tags?: string[];
    reply_length?: string;
    min_follower_count?: number;
    max_post_age_days?: number;
    reply_guidelines?: string;
  },
  opts: ApiOptions
) {
  return request("/agents/campaigns", {
    ...opts,
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listCampaigns(
  params: { limit?: number; status?: string },
  opts: ApiOptions
) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.status) qs.set("status", params.status);
  return request(`/agents/campaigns?${qs}`, { ...opts, method: "GET" });
}

export function getCampaign(campaignId: string, opts: ApiOptions) {
  return request(`/agents/campaigns/${campaignId}`, {
    ...opts,
    method: "GET",
  });
}

export function generatePosts(campaignId: string, opts: ApiOptions) {
  return request(`/agents/campaigns/${campaignId}/generate-posts`, {
    ...opts,
    method: "POST",
  });
}

export function reviewPosts(
  campaignId: string,
  data: {
    review_rules: string;
    threshold?: number;
    dry_run?: boolean;
    save_rules?: boolean;
  },
  opts: ApiOptions
) {
  return request(`/agents/campaigns/${campaignId}/review-posts`, {
    ...opts,
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function boostTweet(
  data: {
    tweet_url: string;
    product_id: string;
    action_type: "replies" | "likes" | "repost";
  },
  opts: ApiOptions
) {
  return request("/agents/campaigns/boost", {
    ...opts,
    method: "POST",
    body: JSON.stringify(data),
  });
}

// --- Credits ---

export function getBalance(opts: ApiOptions) {
  return request("/agents/credits/balance", { ...opts, method: "GET" });
}

export function getCreditHistory(
  params: { limit?: number },
  opts: ApiOptions
) {
  const qs = params.limit ? `?limit=${params.limit}` : "";
  return request(`/agents/credits/history${qs}`, { ...opts, method: "GET" });
}
