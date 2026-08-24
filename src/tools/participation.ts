/**
 * Participation domain — the connected user EARNS by doing campaign work.
 *
 * find_opportunities (free) → the user posts a drafted reply from their own X
 * account → submit_participation (attributes + verifies + awards) →
 * get_earnings (free). The submitted reply must be posted by the user's linked
 * X handle — the backend author-matches it before awarding anything.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, NOT_AUTHED, type ToolExtra } from "./_shared.js";

export function registerParticipationTools(server: McpServer): void {
  server.registerTool(
    "find_opportunities",
    {
      title: "Find earning opportunities",
      description:
        "Browse unclaimed reply drafts from active campaigns the connected user can earn from: each item is a real social post plus a pre-drafted reply. Free, read-only. Flow: pick an opportunity → the user posts the reply (verbatim or personalized) from their own X account → call submit_participation with the posted reply's URL. Returns reply opportunities only — like/repost actions need screenshot proof and are web-only (app.productclank.com/communiply/feed).",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Default 25"),
        offset: z.number().int().min(0).optional(),
        campaign_id: z.string().optional().describe("Restrict to one campaign"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ limit, offset, campaign_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        // Reply-only: like/repost claims are proven by screenshot and the agent
        // submit path author-matches the URL as the earner's own tweet — neither
        // fits the connector, so those opportunities must not be claimable here.
        const result = await api.getParticipationFeed({
          limit,
          offset,
          campaignId: campaign_id,
          actionType: "reply",
        });
        return textResult({ posts: result.posts, total: result.total });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Feed fetch failed");
      }
    }
  );

  server.registerTool(
    "submit_participation",
    {
      title: "Submit a posted reply to earn",
      description:
        "Submit the URL of a reply the connected user posted for a claimed opportunity (reply_id from find_opportunities). The backend verifies the tweet exists AND was posted by the user's linked X handle (they must have connected X on their ProductClank profile), then awards points — and credits when the campaign grants them — to the user. Rejected submissions add strikes (3 strikes = blocked), so only submit replies the user actually posted.",
      inputSchema: {
        reply_id: z.string().describe("The reply draft's id from find_opportunities"),
        reply_url: z.string().url().describe("URL of the reply the user posted on X"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ reply_id, reply_url }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.submitParticipation({
          callerUserId: userId,
          replyId: reply_id,
          replyUrl: reply_url,
        });
        return textResult({
          message: result.message,
          points_awarded: result.pointsAwarded ?? 0,
          credits_awarded: result.creditsAwarded ?? 0,
          next_step: "Call get_earnings to see the user's running totals.",
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Submission failed");
      }
    }
  );

  server.registerTool(
    "get_earnings",
    {
      title: "Check participation earnings",
      description:
        "The connected user's participation totals: points, credit balance, and reply stats (submitted / approved / rejected / strikes) for work submitted through this connector. Free, read-only.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.getEarnings({ callerUserId: userId });
        return textResult({
          points: result.points,
          credits: result.credits,
          replies: result.replies,
        });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Earnings fetch failed");
      }
    }
  );
}
