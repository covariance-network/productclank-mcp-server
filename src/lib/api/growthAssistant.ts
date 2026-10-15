/**
 * Growth assistant — a person's personal-brand assistant: every morning it
 * finds posts on the topics they want to be known for and drafts a reply in
 * their voice. Wraps /agents/growth-assistant. The user posts; nothing posts.
 */

import { request } from "./client.js";

export type GrowthNetwork = "twitter" | "linkedin" | "reddit" | "youtube";

export interface GrowthTopic {
  label: string;
  keywords: string[];
}

export interface GrowthAssistantResult {
  success: boolean;
  assistants: Record<string, unknown>[];
  suggestions: Record<string, unknown>[];
  subscription: { subscribed: boolean; status: string; free_first_run_used: boolean; price_usd_per_month: number };
  app_url: string;
  campaign_ids?: string[];
  next_step?: string;
}

export function getGrowthAssistant(callerUserId: string): Promise<GrowthAssistantResult> {
  return request(callerUserId, "/agents/growth-assistant", { method: "GET" });
}

export function setupGrowthAssistant(
  callerUserId: string,
  body: { network: GrowthNetwork; topics: GrowthTopic[]; about?: string; voice?: string; per_day?: 3 | 5 }
): Promise<GrowthAssistantResult> {
  return request(callerUserId, "/agents/growth-assistant", { method: "POST", body: JSON.stringify(body) });
}
