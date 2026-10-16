/**
 * Watch-quiz domain — the owner side only. Viewers open a video, wait its full
 * length, then answer one counting question about it; a right answer earns
 * points. The agent cannot watch the video, so the questions come from the
 * owner (or suggest_quiz_questions, which the owner then confirms). Agents
 * cannot take quizzes.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";

/** The quiz fields shared with boost_post's `watch_quiz`. */
export const quizQuestionsSchema = z
  .array(
    z.object({
      question: z
        .string()
        .min(1)
        .max(200)
        .describe("A counting question only someone who watched can answer, e.g. 'How many times does she say \"ship\"?'"),
      answer: z.number().int().min(0).describe("The whole-number answer."),
    })
  )
  .min(1)
  .max(20)
  .describe("1–20 questions with their answers. Each viewer draws one. Get them from the user — you cannot watch the video.");

export const quizDurationSchema = z
  .union([z.number().int().min(5).max(3600), z.string()])
  .optional()
  .describe("Video length in seconds, or \"m:ss\". Omit to read it from the TikTok / YouTube page; other platforms need it.");

export const quizMaxAnswersSchema = z
  .number()
  .int()
  .min(1)
  .max(1000)
  .optional()
  .describe("People who may answer before the quiz closes to new viewers (default 20). Worst case = all of them right = 2,000 credits.");

export function registerWatchQuizTools(server: McpServer): void {
  server.registerTool(
    "create_watch_quiz",
    {
      title: "Create a watch quiz for a video",
      description:
        "Get people to watch a video ALL the way through: viewers open it, wait its full length, then answer ONE counting question about it ('how many times does she say X?') that only a viewer can answer. A right answer earns ProductClank points; a wrong first answer gets one more try (watch again). Public, runs exactly 24 hours. Works on any video link (TikTok, YouTube, Instagram Reels, …). COST: nothing now — the user pays 100 credits per CORRECT answer (wrong answers are free) for 24 hours after this chat, for at most max_answers people (default 20 = 2,000 credits max). Needs 100 credits on hand. Before calling: get the questions AND answers from the user (or run suggest_quiz_questions and have them confirm), and confirm max_answers and the maximum spend. Note for the user: paid watch time may count as artificial engagement under the platform's rules. To add a quiz to a boost of the same video, use boost_post's watch_quiz instead.",
      inputSchema: {
        video_url: z.string().url().describe("The video viewers must watch."),
        questions: quizQuestionsSchema,
        duration_sec: quizDurationSchema,
        max_answers: quizMaxAnswersSchema,
        product_id: z.string().optional().describe("Optional product UUID (from search_products) to name the quiz after."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ video_url, questions, duration_sec, max_answers, product_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.createWatchQuiz(userId, {
          video_url,
          questions,
          ...(duration_sec !== undefined ? { duration_sec } : {}),
          ...(max_answers !== undefined ? { max_answers } : {}),
          ...(product_id ? { product_id } : {}),
        });
        return textResult({
          quiz_id: r.campaign.id,
          quiz_url: r.campaign.public_url,
          ends_at: r.campaign.ends_at,
          ...r.watch_quiz,
          credits_available: r.credits.credits_available,
          next_step: "Share quiz_url with the audience. Check progress with get_watch_quiz_results.",
        });
      } catch (error) {
        return toolError(error, "Could not create the watch quiz");
      }
    }
  );

  server.registerTool(
    "suggest_quiz_questions",
    {
      title: "Suggest watch-quiz questions from a TikTok",
      description:
        "AI watches a TikTok (frames + captions) and suggests counting questions with their answers and the evidence for each — high confidence only. Creates nothing. Costs 40 credits, charged only when questions come back. Show every question WITH its evidence to the user and pass only the ones they confirm to create_watch_quiz (or boost_post's watch_quiz). If it fails, nothing is charged — ask the user for questions instead.",
      inputSchema: {
        video_url: z.string().url().describe("TikTok video URL."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ video_url }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.suggestQuizQuestions(userId, video_url);
        return textResult({
          video_url: r.video_url,
          duration_sec: r.duration_sec,
          questions: r.questions,
          credits_used: r.credits.credits_used,
          credits_remaining: r.credits.credits_remaining,
          next_step: r.next_step,
        });
      } catch (error) {
        return toolError(error, "Could not suggest questions");
      }
    }
  );

  server.registerTool(
    "get_watch_quiz_results",
    {
      title: "Get watch-quiz results",
      description:
        "Results of one of the user's watch quizzes (made here, in the web app, or on a boost): state (live / paused / ended), how many people started, answered, got it right, ran out of tries, or used their second try, how each question did, and the credits billed so far. Free, read-only. A question most viewers miss is usually ambiguous — say so. 'paused' with credits left means the user paused it; otherwise the balance ran out.",
      inputSchema: {
        quiz_id: z.string().uuid().describe("The quiz id from create_watch_quiz (or boost_post's watch_quiz.campaign_id)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ quiz_id }, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      try {
        const r = await api.getWatchQuizResults(userId, quiz_id);
        return textResult({
          quiz: r.campaign,
          results: r.results,
          questions: r.questions,
          credits_billed: r.credits.credits_billed,
        });
      } catch (error) {
        return toolError(error, "Could not load the quiz results");
      }
    }
  );
}
