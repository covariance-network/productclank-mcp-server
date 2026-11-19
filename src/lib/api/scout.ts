/**
 * Scouts — an approved ProductClank scout works their deals: founder posts the
 * matcher picked for them, each with a drafted opener. Wraps
 * /agents/scout/**. Every call acts as the signed-in user; a user who is not
 * an approved scout gets 403 `not_a_scout` / `scout_not_approved`.
 *
 * Claim rule: a matched deal waits 12h for its scout, then opens to every
 * scout. A claim holds the deal 72h, then it returns to the shared pool.
 */

import { request } from "./client.js";

export type ScoutProgressStage = "sent" | "replied" | "call_booked" | "closed_won" | "lost";
export type ScoutRating = "would_send" | "would_not";

export interface ScoutDealsResult {
  success: boolean;
  deals: Record<string, unknown>[];
  exclusiveHours: number;
  claimRule: string;
  scout?: Record<string, unknown> | null;
}

export function getScoutDeals(callerUserId: string): Promise<ScoutDealsResult> {
  return request(callerUserId, "/agents/scout/deals", { method: "GET" });
}

export interface ClaimScoutDealResult {
  success: boolean;
  dealId: string;
  reservedUntil: string;
  reply: string | null;
  post: { url: string | null; text: string | null; author: string | null };
  links: { signup: string; call: string } | null;
  next_step?: string;
}

export function claimScoutDeal(callerUserId: string, dealId: string): Promise<ClaimScoutDealResult> {
  return request(callerUserId, `/agents/scout/deals/${encodeURIComponent(dealId)}/claim`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function releaseScoutDeal(callerUserId: string, dealId: string): Promise<{ success: boolean; dealId: string; released: boolean }> {
  return request(callerUserId, `/agents/scout/deals/${encodeURIComponent(dealId)}/release`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export interface ReportScoutProgressResult {
  success: boolean;
  dealId: string;
  status: string;
  starsAwarded: number;
  message: string | null;
}

export function reportScoutDealProgress(
  callerUserId: string,
  dealId: string,
  body: { stage: ScoutProgressStage; replyUrl?: string; note?: string }
): Promise<ReportScoutProgressResult> {
  return request(callerUserId, `/agents/scout/deals/${encodeURIComponent(dealId)}/progress`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function rateScoutDeal(
  callerUserId: string,
  dealId: string,
  rating: ScoutRating
): Promise<{ success: boolean; dealId: string; rating: ScoutRating }> {
  return request(callerUserId, `/agents/scout/deals/${encodeURIComponent(dealId)}/rating`, {
    method: "POST",
    body: JSON.stringify({ rating }),
  });
}

export function getScoutEarnings(callerUserId: string): Promise<Record<string, unknown> & { success: boolean }> {
  return request(callerUserId, "/agents/scout/earnings", { method: "GET" });
}

/* ── Applying (anyone; no approved-scout gate) — /agents/scout/application ── */

export type ScoutApplicationStage = "none" | "researching" | "draft" | "pending_review" | "approved" | "declined";

export interface ScoutApplicationResult {
  success: boolean;
  stage: ScoutApplicationStage;
  next_step: string;
  invited_by: { name: string | null; handle: string | null } | null;
  research_runs_left_today: number;
  profile: Record<string, unknown> | null;
  boundaries: { channels: string[]; dealsPerDay: number } | null;
  boundary_options: { channels: string[]; dealsPerDay: number[] };
  found: Record<string, unknown> | null;
  submitted_at: string | null;
  review: { status: string; reviewedAt: string | null } | null;
  web_url: string;
  first_submit?: boolean;
}

export interface StartScoutApplicationInput {
  x_handle?: string;
  linkedin_url?: string;
  site_url?: string;
  references?: string;
  invite_code?: string;
}

export function startScoutApplication(
  callerUserId: string,
  input: StartScoutApplicationInput
): Promise<{ success: boolean; stage: "researching"; invite_accepted: boolean; next_step: string }> {
  return request(callerUserId, "/agents/scout/application", { method: "POST", body: JSON.stringify(input) });
}

export function getScoutApplication(callerUserId: string): Promise<ScoutApplicationResult> {
  return request(callerUserId, "/agents/scout/application", { method: "GET" });
}

export function submitScoutApplication(
  callerUserId: string,
  input: { profile?: Record<string, unknown>; boundaries?: { channels: string[]; dealsPerDay: number } }
): Promise<ScoutApplicationResult> {
  return request(callerUserId, "/agents/scout/application", { method: "PUT", body: JSON.stringify(input) });
}

export interface ScoutInvitesResult {
  success: boolean;
  code: string;
  link: string;
  /** Ready to paste into a friend's chat: the web link + how to apply from Claude with the code. */
  share_message: string;
  counts: { total: number; pending: number; approved: number; active: number };
  invitees: { name: string | null; handle: string | null; status: string; active: boolean; invited_at: string }[];
  rule: string;
}

export function getScoutInvites(callerUserId: string): Promise<ScoutInvitesResult> {
  return request(callerUserId, "/agents/scout/invites", { method: "GET" });
}
