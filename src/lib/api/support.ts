/**
 * Support — report failures / "I'm stuck" to the ProductClank team, and read
 * their replies. Wraps POST/GET /agents/support; tickets land in the admin
 * Support Center (channel `agent_api`) and alert a human.
 */

import { request } from "./client.js";

export type SupportCategory =
  | "bug"
  | "stuck"
  | "unexpected_result"
  | "docs"
  | "billing"
  | "feature_request"
  | "other";

export type SupportSeverity = "low" | "normal" | "high" | "blocking";

export interface ReportIssueInput {
  callerUserId: string;
  message: string;
  category?: SupportCategory;
  severity?: SupportSeverity;
  ticket_id?: string;
  tool?: string;
  http_status?: number;
  error_code?: string;
  context?: Record<string, unknown> | string;
}

export interface ReportIssueResult {
  success: boolean;
  ticket_id: string;
  created: boolean;
  status: string;
  self_help: string | null;
  next_step: string;
}

export function reportIssue(input: ReportIssueInput): Promise<ReportIssueResult> {
  const { callerUserId, ...body } = input;
  return request(callerUserId, "/agents/support", {
    method: "POST",
    body: JSON.stringify({ ...body, client: "mcp" }),
  });
}

export interface SupportTicketView {
  ticket_id: string;
  subject: string | null;
  status: string;
  priority: string;
  has_reply: boolean;
  created_at: string;
  last_message_at: string;
  messages?: { from: "you" | "productclank_support"; body: string; at: string }[];
}

export function getSupportTickets(
  callerUserId: string,
  opts: { ticket_id?: string; limit?: number } = {}
): Promise<{ success: boolean; tickets?: SupportTicketView[]; ticket?: SupportTicketView }> {
  const qs = new URLSearchParams();
  if (opts.ticket_id) qs.set("ticket_id", opts.ticket_id);
  if (opts.limit) qs.set("limit", String(opts.limit));
  const q = qs.toString();
  return request(callerUserId, `/agents/support${q ? `?${q}` : ""}`, { method: "GET" });
}
