/**
 * TikTok combo — one ask ("run a full TikTok campaign on <video>") instead of three:
 * a likes boost + a replies boost + a watch quiz on the same video. Wraps the existing
 * boost and watch-quiz routes in sequence; there is no new app endpoint.
 *
 * Two-call flow, so nothing is spent before the user says yes:
 *   1. `confirmed` omitted → a free plan: the steps, the up-front price, the quiz worst case.
 *   2. `confirmed: true` → the campaigns are created. Without quiz questions, the tool first
 *      suggests them (40 credits) and stops: the user checks each answer, then call 2 again.
 * Each step bills on its own and is never retried (no idempotency key: a retry double-charges).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, toolError, NOT_AUTHED, type ToolExtra } from "./_shared.js";
import { quizDurationSchema, quizQuestionsSchema } from "./watchQuiz.js";

const LIKES_CREDITS = 300;
const LIKES_COUNT = 30;
const REPLY_CREDITS = 20;
const QUIZ_ANSWER_CREDITS = 100;
const SUGGEST_CREDITS = 40;

const TIKTOK_URL = /^https:\/\/([a-z0-9-]+\.)*tiktok\.com\//i;

interface StepResult {
  step: "replies" | "likes";
  ok: boolean;
  campaign_url?: string;
  campaign_number?: string;
  credits_used?: number;
  waiting_for_post_text?: boolean;
  credits_pending?: number;
  watch_quiz?: Record<string, unknown>;
  error?: string;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerTikTokCampaignTools(server: McpServer): void {
  server.registerTool(
    "launch_tiktok_campaign",
    {
      title: "Launch a full TikTok campaign",
      description:
        "One call for a full TikTok push on ONE video: 30 community likes + up to 10 community replies (AI-drafted comments) + a 24h 'Watch & answer' quiz (viewers watch to the end and answer a counting question). Use it when the user asks for a 'full', 'full blown', 'complete' or 'combo' TikTok campaign, or for likes + replies + quiz together, instead of calling boost_post and create_watch_quiz one by one. Defaults: likes on, 10 replies, quiz for 10 correct answers. Price: likes 300 credits, replies 20 credits each (10 = 200), billed up front; the quiz bills 100 credits per CORRECT answer over 24h, up to quiz_answers (10 = up to 1,000). FLOW: (1) call WITHOUT confirmed to get the free plan and show the user the steps and credit totals; (2) after the user says yes, call again with confirmed: true. If quiz_questions are missing on the confirmed call, the tool suggests questions from the video (40 credits) and creates nothing yet: show the user each question with its evidence, let them fix the answers, then call a third time with quiz_questions and confirmed: true. Each campaign bills separately; on a partial failure the result lists what was created — never call again blindly, it would create duplicates.",
      inputSchema: {
        video_url: z.string().url().describe("The TikTok video URL (tiktok.com or vm.tiktok.com short link)."),
        likes: z.boolean().optional().describe(`Include the likes boost (${LIKES_COUNT} likes, ${LIKES_CREDITS} credits). Default true.`),
        replies: z
          .number()
          .int()
          .min(0)
          .max(10)
          .optional()
          .describe(`Community replies (AI-drafted comments), 0–10. ${REPLY_CREDITS} credits each. Default 10. 0 = no replies boost.`),
        quiz_answers: z
          .number()
          .int()
          .min(0)
          .max(1000)
          .optional()
          .describe(`Watch quiz cap: how many people may answer. Billed ${QUIZ_ANSWER_CREDITS} credits per CORRECT answer only. Default 10. 0 = no quiz.`),
        quiz_questions: quizQuestionsSchema
          .optional()
          .describe("Counting questions with whole-number answers, confirmed by the user. Omit and the confirmed call suggests them first (40 credits)."),
        quiz_duration_sec: quizDurationSchema,
        reply_guidelines: z.string().optional().describe("Optional tone and content guidance for the replies."),
        post_text: z.string().optional().describe("Optional — the video caption, if known. Skips the wait on a TikTok posted under a minute ago."),
        spread_over_hours: z.number().int().min(2).max(72).optional().describe("Optional — pace each boost over this many hours instead of all at once. Same price."),
        product_id: z.string().optional().describe("Optional product UUID (from search_products) to tailor the replies and name the quiz."),
        confirmed: z.boolean().optional().describe("Set true only after the user approved the plan and its credit totals. Omit to get the free plan."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, extra) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      if (!TIKTOK_URL.test(args.video_url)) return errorResult("launch_tiktok_campaign takes a TikTok video URL. For other platforms use boost_post.");

      const likes = args.likes ?? true;
      const replies = args.replies ?? 10;
      const quizAnswers = args.quiz_answers ?? 10;
      if (!likes && replies === 0 && quizAnswers === 0) return errorResult("Nothing to launch: likes, replies and the quiz are all off.");

      const upFront = (likes ? LIKES_CREDITS : 0) + replies * REPLY_CREDITS;
      const quizMax = quizAnswers * QUIZ_ANSWER_CREDITS;
      const needsQuestions = quizAnswers > 0 && !args.quiz_questions?.length;
      const steps = [
        ...(replies > 0 ? [`${replies} community replies — ${replies * REPLY_CREDITS} credits up front`] : []),
        ...(likes ? [`${LIKES_COUNT} community likes — ${LIKES_CREDITS} credits up front`] : []),
        ...(quizAnswers > 0
          ? [
              `Watch & answer quiz for 24h, up to ${quizAnswers} answers — ${QUIZ_ANSWER_CREDITS} credits per correct answer, up to ${quizMax}` +
                (needsQuestions ? ` (questions suggested from the video first: ${SUGGEST_CREDITS} credits)` : ""),
            ]
          : []),
      ];

      try {
        const { balance } = await api.getCreditBalance(userId);
        const neededNow = upFront + (quizAnswers > 0 ? QUIZ_ANSWER_CREDITS : 0) + (needsQuestions ? SUGGEST_CREDITS : 0);

        if (!args.confirmed) {
          return textResult({
            status: "plan",
            video_url: args.video_url,
            steps,
            credits_up_front: upFront,
            quiz_max_credits: quizMax,
            worst_case_total: upFront + quizMax + (needsQuestions ? SUGGEST_CREDITS : 0),
            credits_available: balance,
            enough_credits: balance >= neededNow,
            next_step:
              balance >= neededNow
                ? "Show the user these steps and totals. When they say yes, call launch_tiktok_campaign again with the same arguments and confirmed: true."
                : `Not enough credits: ${neededNow} needed now, ${balance} available. Ask the user to top up, or lower replies / turn likes off.`,
          });
        }

        if (balance < neededNow) {
          return errorResult(`Not enough credits: ${neededNow} needed now, ${balance} available. Nothing was created.`);
        }

        if (needsQuestions) {
          const s = await api.suggestQuizQuestions(userId, args.video_url);
          return textResult({
            status: "confirm_quiz_questions",
            nothing_created_yet: true,
            suggested_questions: s.questions,
            duration_sec: s.duration_sec,
            credits_used: s.credits.credits_used,
            next_step:
              "Show the user each question with its evidence and ask them to check every answer against the video (a wrong answer fails honest viewers). Then call launch_tiktok_campaign again with the confirmed quiz_questions and confirmed: true.",
          });
        }

        const quiz =
          quizAnswers > 0 && args.quiz_questions?.length
            ? {
                questions: args.quiz_questions,
                max_answers: quizAnswers,
                ...(args.quiz_duration_sec !== undefined ? { duration_sec: args.quiz_duration_sec } : {}),
              }
            : undefined;

        // The quiz rides on the first boost (one linked 'Watch & answer'). No retries.
        const plan: { step: StepResult["step"]; actionType: "replies" | "likes"; count?: number }[] = [
          ...(replies > 0 ? [{ step: "replies" as const, actionType: "replies" as const, count: replies }] : []),
          ...(likes ? [{ step: "likes" as const, actionType: "likes" as const }] : []),
        ];
        const results: StepResult[] = [];
        let quizAttached = false;
        for (const p of plan) {
          const withQuiz = quiz && !quizAttached ? quiz : undefined;
          try {
            const r = await api.boostPost({
              callerUserId: userId,
              postUrl: args.video_url,
              productId: args.product_id,
              actionType: p.actionType,
              replyGuidelines: args.reply_guidelines,
              count: p.count,
              postText: args.post_text,
              spreadOverHours: args.spread_over_hours,
              watchQuiz: withQuiz,
            });
            if (withQuiz) quizAttached = true;
            results.push({
              step: p.step,
              ok: true,
              campaign_url: r.campaign.url,
              campaign_number: r.campaign.campaign_number,
              credits_used: r.credits.credits_used,
              ...(r.waiting_for_post_text && { waiting_for_post_text: true, credits_pending: r.credits.credits_pending }),
              ...(r.watch_quiz && { watch_quiz: r.watch_quiz }),
            });
          } catch (error) {
            results.push({ step: p.step, ok: false, error: errorText(error) });
          }
        }

        // No boost (likes and replies off), or every boost failed before the quiz rode along: create it on its own.
        let quizOnly: Record<string, unknown> | undefined;
        if (quiz && !quizAttached) {
          try {
            const q = await api.createWatchQuiz(userId, { video_url: args.video_url, ...quiz, ...(args.product_id ? { product_id: args.product_id } : {}) });
            quizOnly = { ok: true, quiz_url: q.campaign.public_url, ends_at: q.campaign.ends_at, max_credits: q.watch_quiz.max_credits };
          } catch (error) {
            quizOnly = { ok: false, error: errorText(error) };
          }
        }

        const quizError = results.find((r) => r.watch_quiz && typeof r.watch_quiz.error === "string")?.watch_quiz?.error;
        const failed = results.filter((r) => !r.ok).length + (quizOnly && !quizOnly.ok ? 1 : 0) + (quizError ? 1 : 0);
        return textResult({
          status: failed === 0 ? "launched" : results.some((r) => r.ok) || quizOnly?.ok ? "partly_launched" : "failed",
          steps: results,
          ...(quizOnly && { watch_quiz: quizOnly }),
          credits_used_up_front: results.reduce((n, r) => n + (r.credits_used ?? 0), 0),
          quiz_max_credits: quiz ? quizMax : 0,
          ...(failed > 0 && {
            note: "Some steps failed (see each step's error). The others are live and billed. Do NOT call this tool again for the whole combo: it would duplicate the live campaigns. Fix the cause, then run only the missing step with boost_post or create_watch_quiz.",
          }),
        });
      } catch (error) {
        return toolError(error, "TikTok campaign failed");
      }
    }
  );
}
