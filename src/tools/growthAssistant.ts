/**
 * Growth assistant domain — personal brand for the USER (not a product): pick
 * the topics they want to be known for; every morning the assistant finds up to
 * 5 posts on X or LinkedIn worth replying to and drafts a reply in their voice.
 * The user posts the reply from their own account; the assistant never posts.
 * Priced at cost: free to set up, a flat 3 credits per daily run.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";

const topic = z.object({
  label: z.string().min(1).max(60).describe("2-5 words, e.g. 'Stablecoin payments'."),
  keywords: z
    .array(z.string().min(1).max(60))
    .min(1)
    .max(8)
    .describe("1-8 search phrases, 1-4 words each, that OTHER people write in posts on this topic. No sentences, hashtags or very broad words ('AI')."),
});

export function registerGrowthAssistantTools(server: McpServer): void {
  server.registerTool(
    "setup_growth_assistant",
    {
      title: "Set up my personal growth assistant",
      description:
        "Personal brand growth for the USER (not a product campaign): every morning it finds up to 5 posts on ONE network (X, LinkedIn, Reddit or YouTube) on the topics the user wants to be known for, each with a draft reply in their voice (no product mentions, no links). The user posts the replies themselves. Free to set up, no credits. After setup the user opens the app link for the free first run (live) and the $5/month subscription that turns on the daily run + morning email (the card step happens in their browser). Before calling: agree with the user on 2-4 topics and their search phrases, one or two sentences about who they are, and a few rules for how their replies should read — draft these from what you know about them and confirm. Calling again updates the assistant in place.",
      inputSchema: {
        network: z.enum(["twitter", "linkedin", "reddit", "youtube"]).describe("The ONE network where the user wants to be visible: twitter (X), linkedin, reddit or youtube."),
        topics: z.array(topic).min(1).max(4).describe("1-4 topics the user wants to be known for."),
        about: z.string().max(600).optional().describe("Who the user is and the angle they add, 1-2 sentences."),
        voice: z.string().max(1200).optional().describe("How their replies should read, one rule per line."),
        per_day: z.union([z.literal(3), z.literal(5)]).optional().describe("Posts per day (default 5)."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.setupGrowthAssistant(userId, { ...args });
        return textResult({
          assistants: r.assistants,
          subscription: r.subscription,
          app_url: r.app_url,
          next_step: r.next_step,
          user_note: r.subscription.subscribed
            ? `Saved. New posts arrive every morning by email and at ${r.app_url}. You post the replies yourself.`
            : `Saved. Open ${r.app_url} to run it once for free and see real posts with drafts. $${r.subscription.price_usd_per_month}/month then gets you new ones every morning. You post the replies yourself.`,
        });
      } catch (error) {
        return toolError(error, "Could not set up the growth assistant");
      }
    }
  );

  server.registerTool(
    "get_growth_suggestions",
    {
      title: "Get today's posts to reply to",
      description:
        "The user's growth assistant: posts found in the last 3 days on their topics that still wait for a reply, each with a draft reply in their voice, plus the assistant settings. Free, read-only. Show each post briefly (author, post, link, draft) and help the user edit the draft; they post it from their own account. If there are no assistants, offer setup_growth_assistant.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (_args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.getGrowthAssistant(userId);
        return textResult({
          suggestions: r.suggestions,
          assistants: r.assistants,
          subscription: r.subscription,
          app_url: r.app_url,
          next_step: r.assistants.length
            ? r.suggestions.length
              ? "Help the user pick and edit a draft, then they post it from their own account."
              : "No open posts right now. New ones arrive every morning."
            : "No growth assistant yet. Offer setup_growth_assistant.",
        });
      } catch (error) {
        return toolError(error, "Could not load the growth assistant");
      }
    }
  );
}
