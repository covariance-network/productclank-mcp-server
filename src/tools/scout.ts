/**
 * Scout domain — an approved ProductClank scout works their deals from the
 * assistant: founder posts the matcher picked for them, each with a drafted
 * opener that introduces @goldenberglior. The scout posts the reply from their
 * own X account; the assistant never posts.
 *
 * Claim rule: a matched deal waits 12h for its scout, then opens to every
 * scout. A claim holds it 72h, then it returns to the shared pool. Scouts earn
 * a commission on sales from their deals plus a monthly top-scouts pool.
 *
 * Not in the creator (Meta) profile: scouting is BD outreach, not commissioned
 * original content.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";

const dealId = z.string().uuid().describe("The deal id from get_scout_deals.");

export function registerScoutTools(server: McpServer): void {
  server.registerTool(
    "get_scout_deals",
    {
      title: "Get my scout deals",
      description:
        "For approved ProductClank scouts: the founder posts picked for you today, each with the post, why it fits, a drafted opener, its status and your signup/call links. Free, read-only. Use it when the user asks 'what deals do you have for me?'. Show each deal briefly (founder, post, the opener) and let the user pick. A deal matched to them is theirs alone for 12h, then open to every scout. If the user is not a scout (403 not_a_scout / scout_not_approved), relay the message: they apply at https://www.productclank.com/scouts.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.getScoutDeals(userId);
        return textResult({
          deals: r.deals,
          claim_rule: r.claimRule,
          next_step: r.deals.length
            ? "Let the user pick a deal, then claim_deal to hold it before they post."
            : "No open deals right now. New ones arrive daily.",
        });
      } catch (error) {
        return toolError(error, "Could not load scout deals");
      }
    }
  );

  server.registerTool(
    "claim_deal",
    {
      title: "Claim a scout deal",
      description:
        "Hold a deal for this scout for 72 hours so no other scout replies to the same founder. Free. Call it when the user decides to reply, BEFORE they post. Returns the post link, the drafted opener and the scout's links. The user posts the reply from their OWN X account (you never post), then you call report_deal_progress with stage 'sent' and the reply URL. Claiming again refreshes the hold. 409 claimed_by_another_scout = someone else holds it; pick another deal.",
      inputSchema: { dealId },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ dealId }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.claimScoutDeal(userId, dealId);
        return textResult({
          deal_id: r.dealId,
          held_until: r.reservedUntil,
          post: r.post,
          opener: r.reply,
          links: r.links,
          user_note:
            "The deal is yours for 72 hours. Reply to the post from your own X account (edit the opener so it sounds like you), then send me the link to your reply.",
        });
      } catch (error) {
        return toolError(error, "Could not claim the deal");
      }
    }
  );

  server.registerTool(
    "release_deal",
    {
      title: "Release a scout deal",
      description:
        "Give a claimed deal back to the shared pool (the user will not reply to it). Free. Use it when the user skips a deal they claimed, so another scout can take it.",
      inputSchema: { dealId },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ dealId }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.releaseScoutDeal(userId, dealId);
        return textResult({ deal_id: r.dealId, released: r.released });
      } catch (error) {
        return toolError(error, "Could not release the deal");
      }
    }
  );

  server.registerTool(
    "report_deal_progress",
    {
      title: "Report scout deal progress",
      description:
        "Move a deal forward. stage 'sent' + replyUrl (the URL of the reply the user posted on X) records the reply and awards Stars; it must be the user's own reply, not the founder's post. Later stages are private pipeline steps: 'replied' (the founder answered), 'call_booked', 'closed_won', 'lost'. Free. Only report what the user tells you happened.",
      inputSchema: {
        dealId,
        stage: z.enum(["sent", "replied", "call_booked", "closed_won", "lost"]),
        replyUrl: z.string().url().optional().describe("Required for 'sent': https://x.com/<user>/status/<id> of the user's reply."),
        note: z.string().max(1000).optional().describe("Optional private note on this step."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ dealId, stage, replyUrl, note }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      if (stage === "sent" && !replyUrl) return errorResult("For stage 'sent', pass replyUrl — the link to the reply the user posted on X.");
      try {
        const r = await api.reportScoutDealProgress(userId, dealId, { stage, replyUrl, note });
        return textResult({ deal_id: r.dealId, status: r.status, stars_awarded: r.starsAwarded, message: r.message });
      } catch (error) {
        return toolError(error, "Could not report progress");
      }
    }
  );

  server.registerTool(
    "rate_deal",
    {
      title: "Rate a scout deal",
      description:
        "Tell ProductClank whether this deal was a good pick: 'would_send' or 'would_not'. Free. It tunes which posts the matcher picks for this scout. Ask the user when they skip or finish a deal.",
      inputSchema: { dealId, rating: z.enum(["would_send", "would_not"]) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ dealId, rating }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.rateScoutDeal(userId, dealId, rating);
        return textResult({ deal_id: r.dealId, rating: r.rating });
      } catch (error) {
        return toolError(error, "Could not save the rating");
      }
    }
  );

  server.registerTool(
    "get_scout_earnings",
    {
      title: "Get my scout earnings",
      description:
        "The scout's pipeline by stage, commissions earned from their deals, and their rank in this month's top-scouts pool. Free, read-only.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const { success: _ok, ...rest } = await api.getScoutEarnings(userId);
        return textResult(rest);
      } catch (error) {
        return toolError(error, "Could not load scout earnings");
      }
    }
  );
}
