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
        "Browse unclaimed reply drafts from active campaigns the connected user can earn from: each item is a real social post plus a pre-drafted reply, with the `platform` it lives on (X, Reddit, YouTube, LinkedIn). Free, read-only. Flow: pick an opportunity → the user posts the reply (verbatim or personalized) from their own account on that platform → call submit_participation with the posted reply's URL. The user needs that platform's handle linked on their ProductClank profile for the reward to be attributable. Returns reply opportunities only — likes and reposts are proved with a screenshot and stay in the web app (app.productclank.com/communiply/feed).",
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
        // Reply-only: likes and reposts are proved by an uploaded screenshot,
        // which this connector has no way to produce. Every reply platform is
        // fair game — attribution runs off the user's linked handle.
        const result = await api.getParticipationFeed({
          limit,
          offset,
          campaignId: campaign_id,
          actionType: "reply",
        });
        return textResult({
          posts: result.posts,
          total: result.total,
          ...(result.total === 0
            ? {
                user_note:
                  "No reply opportunities are open right now. This is not an error — the open tasks at the moment may all be likes or reposts, which are proved with a screenshot and can only be done in the web app (app.productclank.com/communiply/feed). Worth checking back after new campaigns run discovery.",
              }
            : {}),
        });
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
        "Submit the URL of a reply the connected user posted for a claimed opportunity (reply_id from find_opportunities). Works for X, Reddit, YouTube and LinkedIn replies. Every claim is attributed to the user's linked handle for that platform, so they must have it connected on their ProductClank profile — X replies are additionally author-verified against the live post at submit time, and the others are verified afterwards by the same checks that cover web submissions. If the platform handle is missing the call fails saying which one to add. Awards points, and credits when the campaign grants them. Rejected submissions add strikes (3 strikes = blocked), so only submit replies the user actually posted.",
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
    "find_open_campaigns",
    {
      title: "Find campaigns to participate in",
      description:
        "Discover content and take-action campaigns the connected user can join and earn from: every active public campaign plus campaigns from communities the user belongs to. Each item has a kind — 'content' (create a post/thread/video about the product) or 'take_action' (do a concrete action like voting or starring, with URL/description proof). Free, read-only. Follow with get_campaign_brief before doing any work.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Default 25"),
        kind: z.enum(["content", "take_action"]).optional().describe("Filter by campaign kind"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ limit, kind }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.listOpenCampaigns({ callerUserId: userId, limit, kind });
        return textResult({ campaigns: result.campaigns, total: result.total });
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Campaign discovery failed");
      }
    }
  );

  server.registerTool(
    "get_campaign_brief",
    {
      title: "Read a campaign's participation brief",
      description:
        "The full brief for one campaign: what to create or do (action message, brief sections, content types), how submissions are judged (eligibility + selection criteria), rewards, deadline, and how many submissions the user has left. Free, read-only. If the brief links external instructions (e.g. a skill file), fetch and follow them. Then: create the content or take the action WITH the user, and call submit_campaign_work with the proof.",
      inputSchema: {
        campaign_id: z.string().describe("Campaign id from find_open_campaigns"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ campaign_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult(await api.getCampaignBrief({ callerUserId: userId, campaignId: campaign_id }));
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Brief fetch failed");
      }
    }
  );

  server.registerTool(
    "submit_campaign_work",
    {
      title: "Submit campaign participation proof",
      description:
        "Submit the user's work for a campaign. Three ways to prove it, and any one is enough: proof_url (content they published or an action they took), media_url (a hosted image or video made for the task — the ad-hoc creative case: a demo clip, a mockup, a designed asset), and description (max 500 chars). Media must already be hosted somewhere public and reachable — this API takes links, never uploads; a direct image link is shown to the reviewer inline, anything else (a video, a Loom) is shown as a link they open. If a URL is an X post it must be published by the user's linked X handle (author-verified); other URLs are accepted as-is. Lands as PENDING — the campaign owner reviews and rewards ship on approval (community campaigns pay Stars, public ones leaderboard points). Duplicate URLs are rejected. Check status afterward with get_my_submissions.",
      inputSchema: {
        campaign_id: z.string(),
        proof_url: z
          .string()
          .url()
          .optional()
          .describe("URL of the published content or action proof (X post, video, voting page, …)"),
        media_url: z
          .string()
          .url()
          .optional()
          .describe(
            "Public URL of an image or video produced for the task. Must already be hosted (upload it wherever the user keeps files first) — direct image links render inline for the reviewer; videos and Loom-style links show as a link."
          ),
        description: z
          .string()
          .max(500)
          .optional()
          .describe("What was done, or context for the reviewer"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ campaign_id, proof_url, media_url, description }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.submitCampaignWork({
          callerUserId: userId,
          campaignId: campaign_id,
          castUrl: proof_url,
          mediaUrl: media_url,
          description,
        });
        return textResult(result.data);
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Submission failed");
      }
    }
  );

  server.registerTool(
    "get_my_submissions",
    {
      title: "Check campaign submission status",
      description:
        "The connected user's submissions to one campaign: pending / approved / rejected, with the reviewer's notes. Free, read-only. Use to report outcomes back to the user after submit_campaign_work.",
      inputSchema: { campaign_id: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ campaign_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        return textResult(
          await api.getMyCampaignSubmissions({ callerUserId: userId, campaignId: campaign_id })
        );
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Status fetch failed");
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
