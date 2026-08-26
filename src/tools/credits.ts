/**
 * Credits domain — read-only balance + transaction history.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, NOT_AUTHED, type ToolExtra } from "./_shared.js";

export function registerCreditTools(server: McpServer): void {
  server.registerTool(
    "check_balance",
    {
      title: "Check credit balance",
      description:
        "Return the connected user's ProductClank credit balance and plan. Use before launching a campaign to confirm they have enough credits (a content campaign costs 1000; a reply boost 200; likes/reposts 300; a discovery campaign 10 to create + 12/post discovered).",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const { balance, plan } = await api.getCreditBalance(userId);
        return textResult({ balance, plan });
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Balance lookup failed"
        );
      }
    }
  );

  server.registerTool(
    "credit_history",
    {
      title: "Credit transaction history",
      description:
        "The connected user's credit transactions (purchases, campaign spend, participation rewards), newest first. Free, read-only. Use to account for what this connector has spent or earned. Top-ups are NOT available in-connector — send the user to app.productclank.com/credits/purchase when the balance runs low.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Default 20"),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ limit, offset }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.getCreditHistory({ callerUserId: userId, limit, offset });
        return textResult({ transactions: result.transactions, total: result.total });
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "History lookup failed"
        );
      }
    }
  );
}
