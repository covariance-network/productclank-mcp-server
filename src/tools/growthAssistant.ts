/**
 * Growth assistant domain — personal brand for the USER (not a product): pick
 * the topics they want to be known for; every morning the assistant finds up to
 * 5 posts on X or LinkedIn worth replying to and drafts a reply in their voice.
 * The user posts the reply from their own account; the assistant never posts.
 * Free to set up; the daily run is a $9/month or $99/year subscription the
 * user takes in the app (never through this server).
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
        "Personal brand growth for the USER (not a product campaign): every morning it finds up to 5 posts on ONE network (X, LinkedIn, Reddit or YouTube) on the topics the user wants to be known for, each with a draft reply in their voice (no product mentions, no links). The user posts the replies themselves. Free to set up, no credits. After setup the user opens the app link for the free first run (live) and the $9/month (or $99/year) subscription that turns on the daily run + morning email (the card step happens in their browser). Before calling: agree with the user on 2-4 topics and their search phrases, one or two sentences about who they are, and a few rules for how their replies should read — draft these from what you know about them and confirm. Calling again updates the assistant in place.",
      inputSchema: {
        network: z.enum(["twitter", "linkedin", "reddit", "youtube"]).describe("The ONE network where the user wants to be visible: twitter (X), linkedin, reddit or youtube."),
        topics: z.array(topic).min(1).max(4).describe("1-4 topics the user wants to be known for."),
        about: z.string().max(600).optional().describe("Who the user is and the angle they add, 1-2 sentences."),
        voice: z.string().max(1200).optional().describe("How their replies should read, one rule per line."),
        per_day: z.union([z.literal(3), z.literal(5)]).optional().describe("Posts per day (default 5)."),
        mix: z
          .enum(["relevance", "balanced", "busy", "early"])
          .optional()
          .describe(
            "Which posts the daily picks favour: relevance (default: the top-scored posts), balanced (about 2 in 5 are busy threads, the rest early posts), busy (mostly busy threads: a bigger audience, the reply sits lower), early (mostly posts with few comments: the author reads you). Each draft is also written for the kind of post it lands on. Leave unset unless the user asks for a mix."
          ),
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
            : `Saved. Open ${r.app_url} to run it once for free and see real posts with drafts. $${r.subscription.price_usd_per_month}/month${r.subscription.price_usd_per_year ? ` (or $${r.subscription.price_usd_per_year}/year)` : ""} then gets you new ones every morning. You post the replies yourself.`,
        });
      } catch (error) {
        return toolError(error, "Could not set up the growth assistant");
      }
    }
  );

  server.registerTool(
    "prepare_growth_assistant",
    {
      title: "Prepare a growth assistant for someone in a chat",
      description:
        "For an agent that helps SOMEONE ELSE in a group or private chat (for example a WhatsApp community agent), not the signed-in user. Prepares that person's personal growth assistant and returns a link they open to sign in and start it. It creates nothing on any account until the person confirms with their own sign-in, so never ask for or pass a phone number, email or user id. Before calling: ask the person what they want (goal: clients, a job, hires, partners or a following) and their X or LinkedIn handle; draft 2-4 topics with search phrases and one or two sentences about them, and confirm. Let the person pick the network (X or LinkedIn). With preview (X and LinkedIn, on by default) it returns up to 3 real posts with a draft reply each: show them in the chat first (author, the post in one line, the draft, the link), then send the link. If you pass space_id (the community space you serve, which your account must manage), the same page lets the person also join that space, so they get opportunities from other members too; mention that in your message. Preview costs about 1 credit per post returned, from YOUR account. For the signed-in user's own assistant, use setup_growth_assistant instead.",
      inputSchema: {
        network: z.enum(["twitter", "linkedin", "reddit", "youtube"]).describe("The ONE network where the person wants to be visible: ask them (X or LinkedIn). The chat preview works on twitter (X) and linkedin."),
        goal: z
          .enum(["clients", "job", "hire", "partners", "audience"])
          .optional()
          .describe("What the person wants: clients (find clients), job (find a job), hire (hire people), partners (find partners), audience (grow a following)."),
        topics: z.array(topic).min(1).max(4).describe("1-4 topics the person wants to be known for."),
        about: z.string().min(1).max(600).describe("Who the person is and the angle they add, 1-2 sentences."),
        voice: z.string().max(1200).optional().describe("How their replies should read, one rule per line."),
        name: z.string().max(40).optional().describe("Optional short name for the assistant, e.g. 'Hiring'."),
        per_day: z.union([z.literal(3), z.literal(5)]).optional().describe("Posts per day (default 5)."),
        preview: z.boolean().optional().describe("Search now and return up to 3 posts with drafts (X and LinkedIn). Default true."),
        space_id: z
          .string()
          .uuid()
          .optional()
          .describe("The community space you serve (your account must manage it). The person can join it on the same page."),
        scout_code: z.string().max(64).optional().describe("A live scout code: the link then credits that scout when the person signs up and pays. Only the code you were configured with."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.prepareGrowthAssistant(userId, { ...args });
        return textResult({
          link: r.link,
          expires_at: r.expires_at,
          preview: r.preview,
          preview_note: r.preview_note,
          next_step: r.next_step,
          user_note: `Open ${r.link} to start. You sign in once, check the setup, and the first run is free. After that, new posts every morning are $9/month. You post every reply yourself.`,
        });
      } catch (error) {
        return toolError(error, "Could not prepare the growth assistant");
      }
    }
  );

  server.registerTool(
    "get_growth_suggestions",
    {
      title: "Get today's posts to reply to",
      description:
        "The user's growth assistant: posts found in the last 3 days on their topics that still wait for a reply, each with a draft reply in their voice, plus the assistant settings. Free, read-only. Each suggestion carries engagement { likes, comments, reposts, views } and kind: busy (many comments: a bigger audience, the reply sits lower), early (few comments: the author reads you) or regular. Show each post briefly (author, likes and comments, kind, post, link, draft) and help the user edit the draft; they post it from their own account. If they want more busy threads or more early posts, set `mix` with setup_growth_assistant. If there are no assistants, offer setup_growth_assistant.",
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
