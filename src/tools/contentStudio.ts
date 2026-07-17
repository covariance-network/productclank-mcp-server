/**
 * Content Studio domain — draft posts into the user's OWN content pipeline.
 *
 * Distinct from the content-*campaign* tools (content.ts): those rally the
 * community to make content FOR a product; these let the agent DRAFT content INTO
 * the user's ProductClank content engine, where a human reviews/edits/schedules it.
 *
 * Two tools over the Content engine's agent endpoints:
 * - list_content_spaces      → GET  /agents/content/spaces
 * - write_content_candidates → POST /agents/content/candidates
 *
 * FREE. Candidates are unreviewed drafts; nothing is auto-published.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, NOT_AUTHED, type ToolExtra } from "./_shared.js";

const MAX_CANDIDATES = 25;

const candidateSchema = z.object({
  text: z.string().describe("The post body / draft text (required)."),
  title: z.string().optional().describe("Short internal label / topic for the draft."),
  platform: z
    .string()
    .optional()
    .describe('Target platform label, e.g. "ProductClank X", "LinkedIn", "Farcaster".'),
  template: z
    .string()
    .optional()
    .describe(
      'Content template, e.g. "Build-in-Public" or "Proof Point". Defaults to Build-in-Public.'
    ),
});

export function registerContentStudioTools(server: McpServer): void {
  // ─── list_content_spaces (read) ───────────────────────────────────────────
  server.registerTool(
    "list_content_spaces",
    {
      title: "List content spaces",
      description:
        "List the ProductClank content spaces you can draft into — spaces the user owns, delegates for, or manages that have their content engine turned on. Returns { space_id, name }. Call this first to resolve the space_id for write_content_candidates, and confirm the target space with the user.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.listContentSpaces(userId);
        const spaces = result.spaces ?? [];
        return textResult({
          spaces,
          note:
            spaces.length === 0
              ? "No content-enabled spaces yet. The user can turn on the content engine at https://app.productclank.com/content."
              : "Pick the space_id the user wants, then call write_content_candidates.",
        });
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Failed to list content spaces"
        );
      }
    }
  );

  // ─── write_content_candidates (free write, human-reviewed) ────────────────
  server.registerTool(
    "write_content_candidates",
    {
      title: "Draft content candidates",
      description:
        "Draft one or more content candidates into a ProductClank content space. FREE — no credits charged. Candidates land as UNREVIEWED DRAFTS in the builder's 'All Content' queue; a human reviews, edits, and schedules them — nothing is auto-published. Resolve space_id via list_content_spaces first. Up to 25 candidates per call. This drafts into the user's OWN content pipeline — it is NOT a community content campaign (use create_content_campaign for that).",
      inputSchema: {
        space_id: z.string().describe("Target content space UUID from list_content_spaces."),
        candidates: z
          .array(candidateSchema)
          .min(1)
          .max(MAX_CANDIDATES)
          .describe(`1–${MAX_CANDIDATES} draft candidates to write.`),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ space_id, candidates }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.writeContentCandidates({
          callerUserId: userId,
          spaceId: space_id,
          candidates,
        });
        return textResult({
          created: result.created,
          draft_ids: result.draft_ids,
          space_id: result.space_id,
          review_url: result.review_url,
          note: "Drafted as unreviewed candidates. The user reviews, edits, and schedules them in the content tool — nothing is auto-published.",
        });
      } catch (error) {
        // Surface actionable API errors (403 not your space, 404 content not enabled) verbatim.
        return errorResult(
          error instanceof Error ? error.message : "Failed to write content candidates"
        );
      }
    }
  );
}
