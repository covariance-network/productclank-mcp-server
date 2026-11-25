/**
 * Growth assistant — a person's personal-brand assistant: every morning it
 * finds posts on the topics they want to be known for and drafts a reply in
 * their voice. Wraps /agents/growth-assistant. The user posts; nothing posts.
 */

import { request } from "./client.js";

export type GrowthNetwork = "twitter" | "linkedin" | "reddit" | "youtube";
/** Which posts the daily picks favour; "relevance" (default) = the top-scored posts. */
export type GrowthMix = "relevance" | "balanced" | "busy" | "early";

export interface GrowthTopic {
  label: string;
  keywords: string[];
}

export interface GrowthAssistantResult {
  success: boolean;
  assistants: Record<string, unknown>[];
  suggestions: Record<string, unknown>[];
  subscription: {
    subscribed: boolean;
    status: string;
    free_first_run_used: boolean;
    price_usd_per_month: number;
    price_usd_per_year?: number;
  };
  app_url: string;
  campaign_ids?: string[];
  next_step?: string;
}

export function getGrowthAssistant(callerUserId: string): Promise<GrowthAssistantResult> {
  return request(callerUserId, "/agents/growth-assistant", { method: "GET" });
}

export function setupGrowthAssistant(
  callerUserId: string,
  body: { network: GrowthNetwork; topics: GrowthTopic[]; about?: string; voice?: string; per_day?: 3 | 5; mix?: GrowthMix }
): Promise<GrowthAssistantResult> {
  return request(callerUserId, "/agents/growth-assistant", { method: "POST", body: JSON.stringify(body) });
}

/** What the person wants from being visible. Shapes which posts count and how drafts read. */
export type GrowthGoal = "clients" | "job" | "hire" | "partners" | "audience";

export interface GrowthHandoffResult {
  success: boolean;
  link: string;
  expires_at: string;
  preview: {
    post_url: string;
    post_text: string;
    /** handle is empty on LinkedIn (no @handle there). */
    author: { name: string | null; handle: string; followers: number };
    likes: number;
    replies: number;
    posted_at: string | null;
    draft_reply: string;
  }[];
  preview_note: string | null;
  next_step: string;
}

/** A chat agent prepares an assistant for SOMEONE ELSE; the person confirms via `link`. */
export function prepareGrowthAssistant(
  callerUserId: string,
  body: {
    network: GrowthNetwork;
    topics: GrowthTopic[];
    about: string;
    voice?: string;
    goal?: GrowthGoal;
    name?: string;
    per_day?: 3 | 5;
    preview?: boolean;
    scout_code?: string;
    space_id?: string;
  }
): Promise<GrowthHandoffResult> {
  return request(callerUserId, "/agents/growth-assistant/handoffs", { method: "POST", body: JSON.stringify(body) });
}
