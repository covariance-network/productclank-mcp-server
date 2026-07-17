/**
 * Content Studio — draft posts into the user's OWN ProductClank content pipeline.
 *
 * NOT a community campaign (see content.ts for content *campaigns*, where the
 * community creates content for a product). These wrap the Content engine's agent
 * endpoints:
 * - listContentSpaces      → GET  /api/v1/agents/content/spaces
 * - writeContentCandidates → POST /api/v1/agents/content/candidates
 *
 * FREE — no credits charged. Candidates land as UNREVIEWED DRAFTS in the builder's
 * "All Content" queue; a human reviews, edits, and schedules them. Nothing is
 * auto-published.
 */

import { request } from "./client.js";

export interface ContentSpace {
  space_id: string;
  name: string;
}

export interface ListContentSpacesResult {
  success: boolean;
  spaces: ContentSpace[];
}

/**
 * The content-enabled spaces the caller may draft into (spaces they own, delegate
 * for, or manage that have their content engine turned on).
 */
export function listContentSpaces(
  callerUserId: string
): Promise<ListContentSpacesResult> {
  const qs = new URLSearchParams({ caller_user_id: callerUserId });
  return request(`/agents/content/spaces?${qs.toString()}`, { method: "GET" });
}

export interface ContentCandidateInput {
  /** The post body / draft text (required). */
  text: string;
  /** Short internal label / topic for the draft. */
  title?: string;
  /** Target platform label, e.g. "ProductClank X", "LinkedIn", "Farcaster". */
  platform?: string;
  /** Content template, e.g. "Build-in-Public", "Proof Point". */
  template?: string;
}

export interface WriteContentCandidatesParams {
  /** OAuth-resolved ProductClank user whose space is written into. */
  callerUserId: string;
  /** Target content space (from listContentSpaces). */
  spaceId: string;
  /** 1–25 draft candidates. */
  candidates: ContentCandidateInput[];
}

export interface WriteContentCandidatesResult {
  success: boolean;
  created: number;
  draft_ids: string[];
  space_id: string;
  /** Where the human reviews/edits/schedules the drafts. */
  review_url: string;
  next_step?: string;
}

/** POST candidates — free, no auto-review, never auto-published. */
export function writeContentCandidates(
  params: WriteContentCandidatesParams
): Promise<WriteContentCandidatesResult> {
  return request("/agents/content/candidates", {
    method: "POST",
    body: JSON.stringify({
      caller_user_id: params.callerUserId,
      space_id: params.spaceId,
      candidates: params.candidates,
    }),
  });
}
