/**
 * Boost domain — rally the community to engage with a specific social post.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";
import { quizDurationSchema, quizMaxAnswersSchema, quizQuestionsSchema } from "./watchQuiz.js";

/**
 * Announce the `bookmarks` action (v0.9.13) in the RESULT of an X likes/repost
 * boost: sessions whose tool definitions predate the release never see the new
 * enum value in the schema, but results always come from the live server.
 */
function bookmarksTip(platform: string, actionType: string): { bookmarks_tip?: string } {
  if (platform !== "twitter" || (actionType !== "likes" && actionType !== "repost")) return {};
  return {
    bookmarks_tip:
      "New on X: boost_post with action_type 'bookmarks' — 10 community bookmarks for 300 credits. Bookmarks lift a post's visibility on X. Also available in the web app's boost form.",
  };
}

export function registerBoostTools(server: McpServer): void {
  server.registerTool(
    "boost_post",
    {
      title: "Boost a social post",
      description:
        "Rally the ProductClank community to engage with a specific social post. Creates a boost campaign and spends the user's credits: 'replies' generates AI reply drafts and 'quote' generates AI-drafted QUOTE POSTS (a repost WITH each member's own text, shown above the quoted post in their followers' feeds, the highest-reach action) — both cost 20 credits per draft, 10 drafts (200 credits) by default; set `count` (1–10) for a smaller boost, e.g. 3 replies = 60 credits. 'likes' is 30 likes for 300 credits by default; set `count` (1–300) for any other size at 10 credits per like, e.g. 100 likes = 1,000 credits. 'bookmarks' (saving a post on X lifts its visibility) and 'repost' are 10 for 300 credits by default; set `count` (1–100) for any other size at 30 credits each, e.g. 25 reposts = 750 credits. Supports Twitter/X, Instagram, TikTok, LinkedIn, Reddit, Farcaster, and YouTube (replies + likes on YouTube; reposts only on X and Farcaster; quote posts and bookmarks only on X) — the platform is auto-detected from the URL. product_id is OPTIONAL: link a product (from search_products or create_product) to tailor replies with the product name, or omit it for a tweet-first boost that uses generic amplification language. A TikTok video under ~1 minute old has no caption yet: the boost is still created, drafts are generated once TikTok publishes the caption (usually within a few minutes), and credits are charged only then — the result says waiting_for_post_text. Pass post_text if you already know the caption to skip the wait. Delivery is immediate by default; to pace it (e.g. 'reply 3 times over the next 6 hours'), set spread_over_hours — one slot goes out now and the rest drip out 1–2 an hour so the last lands within that window, at the same price. On a TikTok / YouTube / Instagram Reel VIDEO, add watch_quiz for 'Watch & answer': viewers can also watch to the end and answer one counting question (a linked 24h watch quiz, billed 100 credits per correct answer on top of the boost price, up to max_answers — see create_watch_quiz). Confirm the action and its credit cost with the user before calling.",
      inputSchema: {
        post_url: z
          .string()
          .url()
          .describe("Full URL of the post to boost (any supported platform)"),
        product_id: z
          .string()
          .optional()
          .describe(
            "Optional product UUID (from search_products or create_product). Omit for a tweet-first boost."
          ),
        action_type: z
          .enum(["replies", "likes", "repost", "quote", "bookmarks"])
          .optional()
          .describe(
            "How the community engages. Default: replies. Reposts are Twitter/Farcaster only; quote posts (repost with the member's own drafted text) and bookmarks (members save the post) are X only."
          ),
        reply_guidelines: z
          .string()
          .optional()
          .describe(
            "Optional guidance for the tone and content of community replies or quote posts"
          ),
        count: z
          .number()
          .int()
          .min(1)
          .max(300)
          .optional()
          .describe(
            "Replies / quote: how many drafts to generate, 1–10 (default 10), billed 20 credits per draft — 3 replies = 60 credits. Likes: how many likes, 1–300 (default 30), billed 10 credits per like — 100 likes = 1,000 credits. Repost / bookmarks: 1–100 (default 10), billed 30 credits each."
          ),
        spread_over_hours: z
          .number()
          .int()
          .min(2)
          .max(72)
          .optional()
          .describe(
            "Optional — pace delivery over this many hours instead of releasing every slot at once. One goes out now, the rest drip out 1–2 per hour. Minimum is ceil((items − 1) / 2) + 1 hours (3 items → 2, 10 → 6). Omit for immediate delivery. Same price."
          ),
        post_text: z
          .string()
          .optional()
          .describe(
            "Optional — the post's text or caption, if you already have it. Skips the server-side fetch (useful for a TikTok you just uploaded)."
          ),
        watch_quiz: z
          .object({
            questions: quizQuestionsSchema,
            duration_sec: quizDurationSchema,
            max_answers: quizMaxAnswersSchema,
          })
          .optional()
          .describe(
            "Optional 'Watch & answer' on a TikTok / YouTube / Instagram Reel video: a linked 24h watch quiz. Billed 100 credits per correct answer (default cap 20 = 2,000 credits), separate from credits_used. Get the questions and answers from the user, or from suggest_quiz_questions."
          ),
      },
      annotations: {
        readOnlyHint: false,
        // Additive: creates a NEW boost campaign; never deletes/overwrites
        // existing data. (Spends credits, but destructiveHint models data
        // destruction, not cost — the description handles the spend warning.)
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ post_url, product_id, action_type, reply_guidelines, count, post_text, spread_over_hours, watch_quiz }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const result = await api.boostPost({
          callerUserId: userId,
          postUrl: post_url,
          productId: product_id,
          actionType: action_type ?? "replies",
          replyGuidelines: reply_guidelines,
          count,
          postText: post_text,
          spreadOverHours: spread_over_hours,
          watchQuiz: watch_quiz,
        });
        return textResult({
          campaign_url: result.campaign.url,
          campaign_number: result.campaign.campaign_number,
          platform: result.campaign.platform,
          action_type: result.campaign.action_type,
          items_generated: result.items_generated,
          items_expected: result.items_expected,
          credits_used: result.credits.credits_used,
          credits_remaining: result.credits.credits_remaining,
          is_reboost: result.campaign.is_reboost,
          ...(result.delivery?.mode === "paced" && { delivery: result.delivery }),
          ...(result.watch_quiz && { watch_quiz: result.watch_quiz }),
          ...bookmarksTip(result.campaign.platform, result.campaign.action_type),
          ...(result.waiting_for_post_text && {
            waiting_for_post_text: true,
            credits_pending: result.credits.credits_pending,
            note: result.message,
          }),
        });
      } catch (error) {
        // Surface actionable API errors (e.g. insufficient credits) verbatim.
        return toolError(error, "Boost failed");
      }
    }
  );
}
