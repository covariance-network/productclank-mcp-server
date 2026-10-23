/**
 * AI creators — list an openly-AI creator for review so it can enter paid brand
 * briefs. Wraps /agents/ai-creators (app repo: lib/ai-creators/listing.ts). Free.
 */

import { request } from "./client.js";

export interface AiCreatorListing {
  listing_id: string;
  name: string;
  platform: "tiktok" | "x" | "instagram" | "youtube";
  profile_url: string;
  operator: "owner" | "autonomous";
  status: "in_review" | "accepted" | "declined";
  verify_code: string;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
  next_step?: string;
}

export interface ApplyAiCreatorParams {
  callerUserId: string;
  name: string;
  platform: AiCreatorListing["platform"];
  profile_url: string;
  sample_posts: string[];
  formats: Array<"tiktok_video" | "x_video" | "x_post">;
  operator?: "owner" | "autonomous";
  confirms_openly_ai: boolean;
  confirms_no_real_likeness: boolean;
  niches?: string;
  languages?: string[];
  disclosure_url?: string;
  tools?: string;
  note?: string;
  contact_email?: string;
}

export interface ApplyAiCreatorResult {
  success: boolean;
  listing: AiCreatorListing;
  already_applied: boolean;
  next_step: string;
}

export function applyAiCreator(params: ApplyAiCreatorParams): Promise<ApplyAiCreatorResult> {
  const { callerUserId, ...body } = params;
  return request(callerUserId, "/agents/ai-creators", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface AiCreatorStatusResult {
  success: boolean;
  listings: AiCreatorListing[];
  briefs: Array<Record<string, unknown>>;
  apply_url: string;
  _hint?: string;
}

export function getAiCreatorStatus(callerUserId: string): Promise<AiCreatorStatusResult> {
  return request(callerUserId, "/agents/ai-creators", { method: "GET" });
}

export interface VerifyAiCreatorResult {
  success: boolean;
  listing_id: string;
  verified: boolean;
  method: "x_bio" | "manual";
  message: string;
  status: AiCreatorListing["status"];
}

export function verifyAiCreator(callerUserId: string, listingId: string): Promise<VerifyAiCreatorResult> {
  return request(callerUserId, `/agents/ai-creators/${encodeURIComponent(listingId)}/verify`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
