/**
 * Credits domain — read-only balance + transaction history.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolProfile } from "./index.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import type { CreditPricing } from "../lib/api/credits.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";

// Engagement-signal actions the creator profile never quotes (see ./index.ts).
const CREATOR_HIDDEN_ACTION = /^(boost_|watch_quiz_)/;

function pricingForProfile(pricing: CreditPricing, profile: ToolProfile): CreditPricing {
  if (profile !== "creator") return pricing;
  return {
    ...pricing,
    action_costs: pricing.action_costs.filter((a) => !CREATOR_HIDDEN_ACTION.test(a.action)),
  };
}

// Descriptions are profile-aware where they name boost (an engagement-signal
// tool the creator profile does not serve). See ./index.ts for why.
export function registerCreditTools(
  server: McpServer,
  profile: ToolProfile = "full"
): void {
  const boostCosts =
    profile === "creator" ? "" : "a reply or quote-post boost 200; likes/bookmarks/reposts 300; ";

  server.registerTool(
    "check_balance",
    {
      title: "Check credit balance",
      description:
        `Free. The connected user's credit balance and plan, PLUS live pricing: every action's cost in credits with a dollar range, top-up packs and plans. Call it before planning or recommending any spend, and quote these prices — never guess or look them up. Pricing is pay-per-action: every tool works on any account whose balance covers the action; plans are only a cheaper rate for steady monthly spend. Typical costs: a content campaign 1000; ${boostCosts}a discovery campaign 10 to create + 12/post discovered.`,
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const { balance, plan, topup_balance, pricing } = await api.getCreditBalance(userId);
        return textResult({
          balance,
          plan,
          ...(topup_balance !== undefined ? { topup_balance } : {}),
          ...(pricing ? { pricing: pricingForProfile(pricing, profile) } : {}),
        });
      } catch (error) {
        return toolError(error, "Balance lookup failed");
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
        return toolError(error, "History lookup failed");
      }
    }
  );
}
