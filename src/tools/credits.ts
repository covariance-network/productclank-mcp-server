/**
 * Credits domain — read-only balance lookup.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getUserCreditBalance } from "../lib/credits.js";
import { getUserId, textResult, errorResult, NOT_AUTHED, type ToolExtra } from "./_shared.js";

export function registerCreditTools(server: McpServer): void {
  server.registerTool(
    "check_balance",
    {
      title: "Check credit balance",
      description:
        "Return the connected user's ProductClank credit balance and plan. Use before launching a campaign to confirm they have enough credits (a content campaign costs 1000; a reply boost 200; likes/reposts 300).",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const { balance, plan } = await getUserCreditBalance(userId);
        return textResult({ balance, plan });
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Balance lookup failed"
        );
      }
    }
  );
}
