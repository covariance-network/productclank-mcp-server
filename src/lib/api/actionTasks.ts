/**
 * Action campaigns — a list of tasks, each ONE action in ONE place ("post in
 * the FraCMO Slack #intros"). Members claim a task, do it from their own
 * account, send proof; the owner approves; the reward is paid.
 * Wraps /agents/campaigns/actions/** (owner), the generic submission review,
 * and the participant task routes. Design: app repo docs/plans/action-campaigns.md.
 */

import { request } from "./client.js";

/** One task as the API takes it (snake_case, like the rest of v1). */
export interface ActionTaskInput {
  destination_name: string;
  destination_url?: string;
  destination_kind?: "community" | "newsletter" | "directory" | "review_site" | "social" | "repo" | "other";
  title: string;
  instructions?: string;
  draft_text?: string;
  requires_membership?: boolean;
  extra_requirements?: string;
  proof_type?: "link" | "screenshot" | "either";
  reward_kind?: "points" | "usdc";
  reward_amount: number;
  mode?: "exclusive" | "open";
  max_completions?: number;
  claim_ttl_hours?: number;
}

type Json = Record<string, unknown>;

export function createActionCampaign(params: {
  callerUserId: string;
  title: string;
  brief?: string;
  productId?: string;
  spaceId?: string;
  targetUrl?: string;
  tasks: ActionTaskInput[];
  claimTtlHours?: number;
  durationDays?: number;
  confirmed: boolean;
}): Promise<Json> {
  return request(params.callerUserId, "/agents/campaigns/actions", {
    method: "POST",
    body: JSON.stringify({
      title: params.title,
      ...(params.brief ? { brief: params.brief } : {}),
      ...(params.productId ? { product_id: params.productId } : {}),
      ...(params.spaceId ? { space_id: params.spaceId } : {}),
      ...(params.targetUrl ? { target_url: params.targetUrl } : {}),
      ...(params.claimTtlHours ? { claim_ttl_hours: params.claimTtlHours } : {}),
      ...(params.durationDays ? { duration_days: params.durationDays } : {}),
      tasks: params.tasks,
      confirmed: params.confirmed,
    }),
  });
}

export function publishActionTasks(params: { callerUserId: string; campaignId: string; taskIds?: string[] }): Promise<Json> {
  return request(params.callerUserId, `/agents/campaigns/actions/${params.campaignId}/publish`, {
    method: "POST",
    body: JSON.stringify(params.taskIds?.length ? { task_ids: params.taskIds } : {}),
  });
}

export function updateActionTasks(params: {
  callerUserId: string;
  campaignId: string;
  add?: ActionTaskInput[];
  edit?: (Partial<ActionTaskInput> & { task_id: string })[];
  close?: string[];
}): Promise<Json> {
  return request(params.callerUserId, `/agents/campaigns/actions/${params.campaignId}/tasks`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(params.add?.length ? { add: params.add } : {}),
      ...(params.edit?.length ? { edit: params.edit } : {}),
      ...(params.close?.length ? { close: params.close } : {}),
    }),
  });
}

export function getActionCampaignResults(params: { callerUserId: string; campaignId: string }): Promise<Json> {
  return request(params.callerUserId, `/agents/campaigns/actions/${params.campaignId}`, { method: "GET" });
}

export function reviewSubmission(params: {
  callerUserId: string;
  campaignId: string;
  submissionId: string;
  decision: "approve" | "reject";
  note?: string;
}): Promise<Json> {
  return request(params.callerUserId, `/agents/campaigns/${params.campaignId}/submissions/${params.submissionId}/review`, {
    method: "POST",
    body: JSON.stringify({ decision: params.decision, ...(params.note ? { note: params.note } : {}) }),
  });
}

export function claimTask(params: {
  callerUserId: string;
  campaignId: string;
  taskId: string;
  profileUrl?: string;
  attestMember?: boolean;
}): Promise<Json> {
  return request(params.callerUserId, `/agents/participate/campaigns/${params.campaignId}/tasks/${params.taskId}/claim`, {
    method: "POST",
    body: JSON.stringify({
      ...(params.profileUrl ? { profile_url: params.profileUrl } : {}),
      ...(params.attestMember !== undefined ? { attest_member: params.attestMember } : {}),
    }),
  });
}

export function releaseTask(params: { callerUserId: string; campaignId: string; taskId: string }): Promise<Json> {
  return request(params.callerUserId, `/agents/participate/campaigns/${params.campaignId}/tasks/${params.taskId}/release`, {
    method: "POST",
    body: "{}",
  });
}

export function uploadProofScreenshot(params: {
  callerUserId: string;
  campaignId: string;
  imageBase64: string;
  contentType: string;
  fileName?: string;
}): Promise<{ success: boolean; screenshot_url: string; next_step?: string }> {
  return request(params.callerUserId, "/agents/participate/proof-upload", {
    method: "POST",
    body: JSON.stringify({
      campaign_id: params.campaignId,
      image_base64: params.imageBase64,
      content_type: params.contentType,
      ...(params.fileName ? { file_name: params.fileName } : {}),
    }),
  });
}
