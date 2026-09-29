/**
 * Support domain — the "support desk for agents".
 *
 * When a ProductClank tool fails in a way its error doesn't explain, or the
 * assistant is stuck, it reports it here instead of retrying in a loop or
 * silently giving up. A human is alerted and replies; get_support_status reads
 * the reply back. Registered in every profile — getting unstuck is not a
 * product feature, it's part of the connector.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";

export function registerSupportTools(server: McpServer): void {
  server.registerTool(
    "report_issue",
    {
      title: "Report an issue to ProductClank support",
      description:
        "Tell the ProductClank team a tool failed, returned something that doesn't make sense, or that you're stuck and can't finish the user's task. Free. A human is alerted and replies (read it with get_support_status). Use this INSTEAD of retrying a failing call in a loop — but not for expected guards the error already explains (insufficient credits, a confirmation prompt, a spend cap): relay those to the user. Include the failing tool, its error code/status and what you tried. If the error_code is a known one, the result carries `self_help` — a fix you can apply right away. Tell the user in one line that you reported it. To add detail to an earlier report pass its ticket_id rather than opening a new one.",
      inputSchema: {
        message: z
          .string()
          .min(10)
          .max(5000)
          .describe("What you were trying to do, what happened, and what you expected."),
        category: z
          .enum(["bug", "stuck", "unexpected_result", "docs", "billing", "feature_request", "other"])
          .optional()
          .describe("Default 'other'."),
        severity: z
          .enum(["low", "normal", "high", "blocking"])
          .optional()
          .describe("'blocking' = you cannot continue the user's task. Default 'normal'."),
        ticket_id: z.string().optional().describe("Follow up on a ticket you opened earlier."),
        tool: z.string().optional().describe("The ProductClank tool that failed, e.g. generate_posts."),
        http_status: z.number().int().optional().describe("Status from the failed call, if shown."),
        error_code: z.string().optional().describe("The machine error code from the failed call, if shown."),
        context: z
          .record(z.unknown())
          .optional()
          .describe("Arguments you passed, the error text, what you already tried. Never include secrets."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.reportIssue({ callerUserId: userId, ...args });
        return textResult({
          ticket_id: result.ticket_id,
          created: result.created,
          self_help: result.self_help,
          next_step: result.next_step,
          user_note: "I've reported this to the ProductClank team — they'll reply to the ticket.",
        });
      } catch (error) {
        return toolError(error, "Could not file the report — tell the user to email support@productclank.com.");
      }
    }
  );

  server.registerTool(
    "get_support_status",
    {
      title: "Check support tickets",
      description:
        "Read the status of issues you reported with report_issue, and ProductClank's replies. Without ticket_id: your recent tickets (look for has_reply:true). With ticket_id: the full conversation. Free, read-only. Check at the start of a session if you reported something earlier.",
      inputSchema: {
        ticket_id: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional().describe("Default 20 (list mode)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ ticket_id, limit }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.getSupportTickets(userId, { ticket_id, limit });
        return textResult(ticket_id ? { ticket: result.ticket } : { tickets: result.tickets ?? [] });
      } catch (error) {
        return toolError(error, "Support lookup failed");
      }
    }
  );
}
