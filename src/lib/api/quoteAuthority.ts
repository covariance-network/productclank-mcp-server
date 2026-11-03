/**
 * Quote authority — borrow authority until you have your own: pin the people the
 * brand's audience already trusts, find their clearest claims on X, and draft quote
 * posts that add the user's own take. Wraps /agents/content/authority/**. Runs on a
 * content space (listContentSpaces). The user quotes the person's post and posts it
 * from their own account; nothing posts and no clip is re-uploaded.
 */

import { request } from "./client.js";

export interface AuthorityMoment {
  url: string;
  handle: string;
  name: string;
  media_type: "video" | "article" | "post";
  claim_type: "claim" | "prediction" | "explanation";
  claim: string;
  topic: string;
  why: string;
  timestamp: string | null;
  posted_at: string | null;
}

export interface AuthorityLatest {
  moments: AuthorityMoment[];
  handles_read: string[];
  pinned_count: number;
  topic: string;
  window_days: number;
  refreshed_at: string;
}

export interface AuthorityPlan {
  subscribed: boolean;
  status: string;
  weekly_run_space_id: string | null;
  last_weekly_run_at: string | null;
  free_find_available: boolean;
  free_suggest_available: boolean;
  price_usd_per_month: number;
  credits_per_month: number;
}

export interface AuthorityPerson {
  handle: string;
  name: string;
  why: string;
  posts_clips: boolean;
  followers: number | null;
  confirmed: boolean;
}

export type AuthorityValueMode = "workflow" | "breakdown" | "disagreement" | "example" | "implication" | "opinion";

export interface QuoteAuthorityState {
  success: boolean;
  space_id: string;
  handles: string[];
  latest: AuthorityLatest | null;
  plan: AuthorityPlan;
  app_url: string;
}

export interface FindMomentsResult {
  success: boolean;
  space_id: string;
  free_run: boolean;
  credits_charged: number;
  latest: AuthorityLatest | null;
  plan: AuthorityPlan;
  next_step: string;
  _hint?: string;
}

export interface SuggestPeopleResult {
  success: boolean;
  space_id: string;
  free_run: boolean;
  credits_charged: number;
  people: AuthorityPerson[];
  plan: AuthorityPlan;
  next_step: string;
}

export interface DraftRunStart {
  success: boolean;
  space_id: string;
  run_id: string;
  status: string;
  next_step: string;
}

export interface DraftRunResult {
  success: boolean;
  space_id: string;
  run_id: string;
  status: string;
  error: string | null;
  drafts: Record<string, unknown>[];
  review_url: string;
  next_step?: string;
}

export function getQuoteAuthority(callerUserId: string, spaceId: string): Promise<QuoteAuthorityState> {
  return request(callerUserId, `/agents/content/authority?space_id=${encodeURIComponent(spaceId)}`, { method: "GET" });
}

export function suggestQuotePeople(
  callerUserId: string,
  body: { space_id: string; topic?: string; exclude?: string[] }
): Promise<SuggestPeopleResult> {
  return request(callerUserId, "/agents/content/authority/suggest", { method: "POST", body: JSON.stringify(body) });
}

export function findQuoteMoments(
  callerUserId: string,
  body: { space_id: string; handles?: string[]; topic?: string; window_days?: 7 | 30 | 90 }
): Promise<FindMomentsResult> {
  return request(callerUserId, "/agents/content/authority", { method: "POST", body: JSON.stringify(body) });
}

export function startQuoteDrafts(
  callerUserId: string,
  body: { space_id: string; url: string; value_mode?: AuthorityValueMode }
): Promise<DraftRunStart> {
  return request(callerUserId, "/agents/content/authority/drafts", { method: "POST", body: JSON.stringify(body) });
}

export function getQuoteDrafts(callerUserId: string, spaceId: string, runId: string): Promise<DraftRunResult> {
  return request(
    callerUserId,
    `/agents/content/authority/drafts?space_id=${encodeURIComponent(spaceId)}&run_id=${encodeURIComponent(runId)}`,
    { method: "GET" }
  );
}
