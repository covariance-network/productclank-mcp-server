/**
 * Quote authority domain — for a user growing an account from zero on X: pin the
 * 10-20 people their audience already trusts, find those people's clearest claims
 * (one live X search that also watches their clips), and draft quote posts that add
 * the user's own value. The user QUOTES the person's post and posts it from their
 * own account; nothing posts and no clip is downloaded or re-uploaded. Runs on a
 * content space (list_content_spaces). First search and first people-suggest are
 * free, then 50 credits each; the $19/month weekly run is taken in the app.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";

const spaceId = z
  .string()
  .min(1)
  .describe("The content space (brand) to run it on — from list_content_spaces. No space yet? setup_content_space first.");

/** Drafting runs in the background upstream (~10-30s); wait this long before handing back a run id. */
const DRAFT_WAIT_MS = 90_000;
const DRAFT_POLL_MS = 3_000;

export function registerQuoteAuthorityTools(server: McpServer): void {
  server.registerTool(
    "get_quote_authority",
    {
      title: "Quote authority: pinned people and latest moments",
      description:
        "Quote authority on one content space: the people pinned to quote, the latest search's moments (each one person's own X post with a single clear claim, prediction or explanation) and the user's plan (free search / free suggest left, $19/month weekly run). Free, read-only. Use it first to see what is already there. Draft from a moment with draft_quote_post.",
      inputSchema: { space_id: spaceId },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.getQuoteAuthority(userId, args.space_id);
        return textResult({
          ...r,
          next_step: !r.handles.length
            ? "No people pinned yet. Offer suggest_quote_people, or ask the user who their audience already listens to, then find_quote_moments with those handles."
            : r.latest?.moments.length
              ? "Show the moments (person, claim, link). For the ones the user likes, call draft_quote_post with the moment url."
              : "People are pinned but there is no search yet. Offer find_quote_moments.",
        });
      } catch (error) {
        return toolError(error, "Could not load Quote authority");
      }
    }
  );

  server.registerTool(
    "suggest_quote_people",
    {
      title: "Suggest people the audience already trusts",
      description:
        "Finds people on X this brand's audience already listens to (favouring people who post clips: podcasts, interviews, talks), each checked against the live X account lookup (confirmed). Excludes people already pinned. Saves nothing — the user picks who to pin. Cost: the user's FIRST suggest is free (plan.free_suggest_available), then 50 credits per call — tell the user the cost and get a yes before a paid call. Then pass the picked handles to find_quote_moments.",
      inputSchema: {
        space_id: spaceId,
        topic: z.string().max(300).optional().describe("Narrow to a topic the audience cares about, e.g. 'B2B onboarding'."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.suggestQuotePeople(userId, { ...args });
        return textResult({
          ...r,
          user_note: r.free_run
            ? "This suggestion was your free one. Next ones cost 50 credits each."
            : `This suggestion cost ${r.credits_charged} credits.`,
        });
      } catch (error) {
        return toolError(error, "Could not suggest people");
      }
    }
  );

  server.registerTool(
    "find_quote_moments",
    {
      title: "Find the pinned people's clearest claims on X",
      description:
        "One live X search over the pinned people's recent posts and clips; returns moments, each the person's own post with ONE clear claim, prediction or explanation, why this audience cares, and where in the clip it is. `handles` (X handles without @, 10-20 works best) replaces the pinned list; omit it to use the saved list. Takes up to ~2 minutes. Cost: the user's FIRST search is free and reads only the first 5 people (plan.free_find_available); after that 50 credits per search, reading everyone pinned — tell the user the cost and get a yes before a paid call. Then draft_quote_post for the moments the user likes. The user posts; never claim a post went out.",
      inputSchema: {
        space_id: spaceId,
        handles: z.array(z.string().min(1).max(50)).max(50).optional().describe("X handles to pin, without @. Omit to search the saved list."),
        topic: z.string().max(300).optional().describe("Only moments on this topic count, e.g. 'pricing'."),
        window_days: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional().describe("How far back to look (default 30)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.findQuoteMoments(userId, { ...args });
        return textResult({
          ...r,
          user_note: r.free_run
            ? `This search was your free one${r._hint ? " and read the first 5 people only" : ""}. Next searches cost 50 credits each, or $${r.plan.price_usd_per_month}/month gets a weekly search by email.`
            : `This search cost ${r.credits_charged} credits.`,
        });
      } catch (error) {
        return toolError(error, "Could not find moments");
      }
    }
  );

  server.registerTool(
    "draft_quote_post",
    {
      title: "Draft quote posts for one moment",
      description:
        "Drafts quote posts for ONE moment from the latest find_quote_moments search: the user's caption names the person and topic and adds value on top (value_mode: workflow, breakdown, disagreement, example, implication or opinion — omit to let the drafter pick). Free. `url` must be a moment url from the latest search. Waits for the drafts (usually under a minute). The drafts also land in the user's Content queue. Show them, help the user edit one; they quote the person's post with it and post from their own account.",
      inputSchema: {
        space_id: spaceId,
        url: z.string().url().describe("The moment's url (the person's own X post) from the latest search."),
        value_mode: z
          .enum(["workflow", "breakdown", "disagreement", "example", "implication", "opinion"])
          .optional()
          .describe("What the caption adds on top of their claim."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const start = await api.startQuoteDrafts(userId, { ...args });
        const deadline = Date.now() + DRAFT_WAIT_MS;
        let run: api.DraftRunResult | null = null;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, DRAFT_POLL_MS));
          run = await api.getQuoteDrafts(userId, start.space_id, start.run_id);
          if (run.status !== "running") break;
        }
        if (!run || run.status === "running") {
          return textResult({
            run_id: start.run_id,
            status: "running",
            next_step: "Still drafting. Call get_content_queue for this space in a minute — the drafts land there.",
          });
        }
        return textResult({
          ...run,
          quote_url: args.url,
          user_note: "Pick a draft and edit it, then quote the person's post with it and post it from your own account.",
        });
      } catch (error) {
        return toolError(error, "Could not draft quote posts");
      }
    }
  );
}
