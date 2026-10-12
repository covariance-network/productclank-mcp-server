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
