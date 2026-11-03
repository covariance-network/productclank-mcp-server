/**
 * AI creators domain — an openly-AI creator (run by a person, or by an agent on
 * its own) applies to ProductClank for paid brand briefs. A person reviews every
 * application; acceptance unlocks the briefs open to AI creators. Free.
 * Web form: https://www.productclank.com/ai-creators/list.
 *
 * Commissioned original content, not engagement — so every profile serves it.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";

export function registerAiCreatorTools(server: McpServer): void {
  server.registerTool(
    "apply_ai_creator",
    {
      title: "Apply an AI creator for paid brand briefs",
      description:
        "List an openly-AI creator (a character account on TikTok, X, Instagram or YouTube) on ProductClank so it can enter paid content briefs from brands and startups. Creates a PRIVATE application that a person reviews (about 48h); nothing is published. Rules the user must confirm before you call: the account says it is AI, and the creator does not copy a real person's face or voice. Returns `verify_code`: tell the user to put it in the account bio (or, if you run the account, put it there), then call verify_ai_creator. Calling again with the same profile returns the open application. Free.",
      inputSchema: {
        name: z.string().min(1).max(80).describe("The AI creator's name."),
        platform: z.enum(["tiktok", "x", "instagram", "youtube"]).describe("Its main platform."),
        profile_url: z.string().min(1).describe("Link or @handle of its account on that platform."),
        sample_posts: z.array(z.string().url()).min(1).max(3).describe("1-3 links to posts it made."),
        formats: z.array(z.enum(["tiktok_video", "x_video", "x_post"])).min(1).describe("What it makes."),
        operator: z
          .enum(["owner", "autonomous"])
          .optional()
          .describe("owner = a person runs it (default); autonomous = an AI agent runs it, e.g. you."),
        confirms_openly_ai: z.literal(true).describe("The account says it is AI. Must be true."),
        confirms_no_real_likeness: z.literal(true).describe("No real person's face or voice. Must be true."),
        niches: z.string().max(300).optional().describe("Niches, comma separated."),
        languages: z.array(z.string()).max(10).optional().describe("Languages it posts in."),
        disclosure_url: z.string().url().optional().describe("Where the account says it is AI (bio link, pinned post)."),
        tools: z.string().max(300).optional().describe("Tools used to make it."),
        note: z.string().max(500).optional().describe("Anything the reviewer should know."),
        contact_email: z.string().email().optional().describe("Where to email about the review (default: the account email)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.applyAiCreator({ callerUserId: userId, ...args });
        return textResult({
          listing: result.listing,
          already_applied: result.already_applied,
          next_step: result.next_step,
        });
      } catch (error) {
        return toolError(error, "AI creator application failed");
      }
    }
  );

  server.registerTool(
    "verify_ai_creator",
    {
      title: "Check an AI creator's bio code",
      description:
        "Check that the listing's `verify_code` is in the AI creator's bio. X bios are read now and the listing is marked verified; TikTok, Instagram and YouTube are checked by hand in review (`method: \"manual\"`). Only the user's own listings. Free.",
      inputSchema: {
        listing_id: z.string().uuid().describe("listing_id from apply_ai_creator or get_ai_creator_status."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ listing_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.verifyAiCreator(userId, listing_id);
        return textResult({
          listing_id: result.listing_id,
          verified: result.verified,
          method: result.method,
          message: result.message,
          status: result.status,
        });
      } catch (error) {
        return toolError(error, "Bio check failed");
      }
    }
  );

  server.registerTool(
    "get_ai_creator_status",
    {
      title: "My AI creators and the briefs they can enter",
      description:
        "The user's AI creator applications (status in_review / accepted / declined, bio code, next step) and the paid briefs open to AI creators: full (brand, summary, url) once one of their AI creators is accepted, else locked with the money only. Entries are made on the brief's page (url). Free, read-only.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.getAiCreatorStatus(userId);
        return textResult({ listings: result.listings, briefs: result.briefs, apply_url: result.apply_url, hint: result._hint });
      } catch (error) {
        return toolError(error, "Could not load AI creator listings");
      }
    }
  );
}
