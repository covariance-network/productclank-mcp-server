/**
 * AI visibility — real people ask ChatGPT / Claude about the product from
 * their own accounts and send back the answer; the owner gets a report.
 * Wraps /agents/campaigns/ai-visibility. One flat launch fee (1000 credits)
 * at create; the panel earns points; the report is free.
 */

import { request } from "./client.js";

export interface AiVisibilityCheckInput {
  product_id: string;
  /** 1–30 buying questions the panel picks from. Omit = people ask in their own words. */
  questions?: string[];
  /** ChatGPT, Claude, Gemini, Perplexity, Grok. Default ChatGPT + Claude. */
  models?: string[];
  /** 1–14, default 4. */
  days?: number;
  /** Panel size, 1–200, default 40. */
  max_participants?: number;
  dry_run?: boolean;
}

export interface AiVisibilityCampaign {
  id: string;
  campaign_number: number | null;
  campaign_type: string;
  kind: string;
  title: string | null;
  product_id: string | null;
  product: string | null;
  models: string[];
  questions: string[];
  state: string;
  starts_at: string | null;
  ends_at: string | null;
  max_participants: number | null;
  public_url: string;
  admin_url: string;
}

export interface CreateAiVisibilityCheckResult {
  success: boolean;
  dry_run?: boolean;
  proposal?: {
    product_id: string;
    product: string;
    title: string;
    models: string[];
    questions: string[];
    days: number;
    max_participants: number;
    action_message: string;
    action_cta: string;
    brief: string;
  };
  campaign?: AiVisibilityCampaign | null;
  check?: { days: number; max_participants: number; models: string[]; question_count: number; report_url: string; billing: string };
  credits: { credits_used?: number; credits_required?: number; credits_available: number; billing_user_id: string; billing?: string };
  next_step?: string;
}

export interface AiVisibilityResults {
  success: boolean;
  campaign: AiVisibilityCampaign;
  submissions: { total: number; pending: number; approved: number; rejected: number; shared_links: number; screenshots: number };
  report: Record<string, unknown> | null;
  report_generated_at: string | null;
  report_url: string | null;
  next_step?: string;
}

export interface AiVisibilityReportResult {
  success: boolean;
  report: Record<string, unknown>;
  report_url: string;
  partial: boolean;
  next_step?: string;
}

export function createAiVisibilityCheck(callerUserId: string, body: AiVisibilityCheckInput): Promise<CreateAiVisibilityCheckResult> {
  return request(callerUserId, "/agents/campaigns/ai-visibility", { method: "POST", body: JSON.stringify(body) });
}

export function getAiVisibilityResults(callerUserId: string, campaignId: string): Promise<AiVisibilityResults> {
  return request(callerUserId, `/agents/campaigns/ai-visibility/${encodeURIComponent(campaignId)}`, { method: "GET" });
}

export function generateAiVisibilityReport(
  callerUserId: string,
  campaignId: string,
  allowPartial: boolean
): Promise<AiVisibilityReportResult> {
  return request(callerUserId, `/agents/campaigns/ai-visibility/${encodeURIComponent(campaignId)}/report`, {
    method: "POST",
    body: JSON.stringify(allowPartial ? { allow_partial: true } : {}),
  });
}
