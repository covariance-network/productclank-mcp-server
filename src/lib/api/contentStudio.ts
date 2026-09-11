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
  return request(callerUserId, "/agents/content/spaces", { method: "GET" });
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
  return request(params.callerUserId, "/agents/content/candidates", {
    method: "POST",
    body: JSON.stringify({
      space_id: params.spaceId,
      candidates: params.candidates,
    }),
  });
}

// ── Setup / calibration / queue / revise / teach (v0.9.0) ───────────────────────

export interface ContentWorkspaceShape {
  brand_name: string;
  platforms: string[];
  voice: string;
  post_types: string;
  platform_playbook: string;
  review_threshold: number;
  automation_paused: boolean;
  trending_source_handles: string[];
  onboarding_completed_at: string | null;
}

export interface ContentTopicShape {
  id: string;
  label: string;
  keywords: string[];
  search_context: string;
  is_active: boolean;
  last_run_at: string | null;
}

export interface ContentStyleGuideShape {
  channel: string;
  voice_summary: string;
  tone_attributes: string[];
  dos: string[];
  donts: string[];
  structure: Record<string, string>;
  lexicon: { preferred: string[]; banned: string[] };
  example_openers: string[];
  updated_at: string;
}

export interface ContentWorkspaceResult {
  success: boolean;
  space_id: string;
  space_name: string;
  enabled: boolean;
  workspace: ContentWorkspaceShape | null;
  topics: ContentTopicShape[];
  style_guides: ContentStyleGuideShape[];
  review_url: string;
  setup_hint?: string;
  /** POST only */
  created_space?: boolean;
  created_workspace?: boolean;
  topics_created?: number;
  next_step?: string;
}

export function getContentWorkspace(
  userId: string,
  spaceId: string
): Promise<ContentWorkspaceResult> {
  const qs = new URLSearchParams({ space_id: spaceId });
  return request(userId, `/agents/content/workspace?${qs.toString()}`, { method: "GET" });
}

export interface ContentTopicInput {
  label: string;
  keywords?: string[];
  search_context?: string;
}

export interface SetupContentWorkspaceParams {
  spaceId?: string;
  newSpace?: { name: string; description?: string };
  brandName?: string;
  platforms?: string[];
  voice?: string;
  postTypes?: string;
  platformPlaybook?: string;
  topics?: ContentTopicInput[];
  reviewThreshold?: number;
  trendingSourceHandles?: string[];
  brandDoc?: string;
}

export function setupContentWorkspace(
  userId: string,
  p: SetupContentWorkspaceParams
): Promise<ContentWorkspaceResult> {
  return request(userId, "/agents/content/workspace", {
    method: "POST",
    body: JSON.stringify({
      space_id: p.spaceId,
      new_space: p.newSpace,
      brand_name: p.brandName,
      platforms: p.platforms,
      voice: p.voice,
      post_types: p.postTypes,
      platform_playbook: p.platformPlaybook,
      topics: p.topics,
      review_threshold: p.reviewThreshold,
      trending_source_handles: p.trendingSourceHandles,
      brand_doc: p.brandDoc,
    }),
  });
}

export interface ContentTopicsResult {
  success: boolean;
  space_id: string;
  topics: ContentTopicShape[];
  created?: number;
}

export function listContentTopics(userId: string, spaceId: string): Promise<ContentTopicsResult> {
  const qs = new URLSearchParams({ space_id: spaceId });
  return request(userId, `/agents/content/topics?${qs.toString()}`, { method: "GET" });
}

export function addContentTopics(
  userId: string,
  spaceId: string,
  topics: ContentTopicInput[]
): Promise<ContentTopicsResult> {
  return request(userId, "/agents/content/topics", {
    method: "POST",
    body: JSON.stringify({ space_id: spaceId, topics }),
  });
}

export function updateContentTopic(
  userId: string,
  spaceId: string,
  topicId: string,
  patch: { label?: string; keywords?: string[]; search_context?: string; is_active?: boolean }
): Promise<{ success: boolean; topic: ContentTopicShape }> {
  return request(userId, "/agents/content/topics", {
    method: "PATCH",
    body: JSON.stringify({ space_id: spaceId, topic_id: topicId, ...patch }),
  });
}

export function removeContentTopic(
  userId: string,
  spaceId: string,
  topicId: string
): Promise<{ success: boolean; deleted: string }> {
  return request(userId, "/agents/content/topics", {
    method: "DELETE",
    body: JSON.stringify({ space_id: spaceId, topic_id: topicId }),
  });
}

export interface ContentTopicSuggestion {
  title: string;
  angle: string;
  why: string;
}

export function suggestContentTopics(
  userId: string,
  spaceId: string
): Promise<{ success: boolean; space_id: string; suggestions: ContentTopicSuggestion[]; next_step?: string }> {
  return request(userId, "/agents/content/topics/suggest", {
    method: "POST",
    body: JSON.stringify({ space_id: spaceId }),
  });
}

export type ContentQueueStatus = "active" | "pending" | "reviewed" | "staged" | "discarded";

export interface ContentDraftShape {
  id: string;
  title: string;
  platform: string;
  template: string;
  text: string;
  status: string;
  source: string;
  review: { score: number | null; verdict: string; summary: string | null; notes: string | null };
  starred: boolean;
  tags: string[];
  created_at: string;
}

export interface ContentQueueResult {
  success: boolean;
  space_id: string;
  status: ContentQueueStatus;
  review_threshold: number;
  counts: { pending: number; reviewed: number; staged: number; discarded: number };
  drafts: ContentDraftShape[];
  review_url: string;
  note?: string;
}

export function getContentQueue(
  userId: string,
  spaceId: string,
  status?: ContentQueueStatus,
  limit?: number
): Promise<ContentQueueResult> {
  const qs = new URLSearchParams({ space_id: spaceId });
  if (status) qs.set("status", status);
  if (limit) qs.set("limit", String(limit));
  return request(userId, `/agents/content/queue?${qs.toString()}`, { method: "GET" });
}

export type ContentDraftAction =
  | "edit"
  | "revise"
  | "fix"
  | "humanize"
  | "review"
  | "stage"
  | "discard";

export const REVISE_PRESETS = [
  "shorter",
  "longer",
  "punchier",
  "deeper",
  "simpler",
  "more_specific",
  "less_salesy",
  "more_casual",
  "more_formal",
] as const;
export type RevisePreset = (typeof REVISE_PRESETS)[number];

export interface ContentDraftActionResult {
  success: boolean;
  action: ContentDraftAction;
  credits_charged: number;
  draft: ContentDraftShape;
  review_url: string;
  note?: string;
}

export function actOnContentDraft(
  userId: string,
  p: {
    spaceId: string;
    draftId: string;
    action: ContentDraftAction;
    text?: string;
    preset?: RevisePreset;
    instruction?: string;
  }
): Promise<ContentDraftActionResult> {
  return request(userId, "/agents/content/drafts", {
    method: "PATCH",
    body: JSON.stringify({
      space_id: p.spaceId,
      draft_id: p.draftId,
      action: p.action,
      text: p.text,
      preset: p.preset,
      instruction: p.instruction,
    }),
  });
}

export interface ContentFeedbackResult {
  success: boolean;
  applied: boolean;
  rule: { id: string; section: string; markdown: string; rationale: string; status: string };
  next_step?: string;
}

export function teachContentVoice(
  userId: string,
  p: { spaceId: string; feedback: string; draftId?: string; apply?: boolean }
): Promise<ContentFeedbackResult> {
  return request(userId, "/agents/content/feedback", {
    method: "POST",
    body: JSON.stringify({
      space_id: p.spaceId,
      feedback: p.feedback,
      draft_id: p.draftId,
      apply: p.apply,
    }),
  });
}
