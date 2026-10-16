/**
 * Watch quiz — viewers watch a video to the end, then answer one counting
 * question only a viewer knows. Wraps /agents/campaigns/watch-quiz.
 * Billed per correct answer (100 credits; wrong answers free) over the quiz's 24 hours, nothing at create.
 */

import { request } from "./client.js";

export interface QuizQuestion {
  question: string;
  answer: number;
}

/** Shared by create_watch_quiz and boost_post's watch_quiz. */
export interface WatchQuizInput {
  questions: QuizQuestion[];
  /** Seconds or "m:ss". Omit to read it from the TikTok / YouTube page. */
  duration_sec?: number | string;
  /** People who may answer before the quiz closes (default 20, max 1000). */
  max_answers?: number;
}

export interface WatchQuizSummary {
  duration_sec: number;
  question_count: number;
  runs_hours: number;
  max_answers: number;
  credits_per_answer: number;
  max_credits: number;
  billing: string;
  duration_source: "given" | "video_page";
}

export interface CreateWatchQuizResult {
  success: boolean;
  campaign: {
    id: string;
    campaign_number: number | null;
    video_url: string;
    ends_at: string | null;
    public_url: string;
  };
  watch_quiz: WatchQuizSummary;
  credits: { credits_used: number; credits_available: number };
  next_step?: string;
}

export interface SuggestQuizQuestionsResult {
  success: boolean;
  video_url: string;
  duration_sec: number | null;
  questions: { question: string; answer: number; evidence: string; confidence: string }[];
  credits: { credits_used: number; credits_remaining: number };
  next_step?: string;
}

export interface WatchQuizResults {
  success: boolean;
  campaign: Record<string, unknown> & { state: string; public_url: string };
  results: {
    viewers_started: number;
    answers: number;
    correct: number;
    wrong: number;
    in_progress: number;
    second_tries: number;
    correct_rate: number | null;
  };
  questions: { question: string; answer: number; tries: number; correct: number }[];
  credits: { credits_billed: number; bills_per_answer: boolean };
}

export function createWatchQuiz(
  callerUserId: string,
  body: WatchQuizInput & { video_url: string; product_id?: string }
): Promise<CreateWatchQuizResult> {
  return request(callerUserId, "/agents/campaigns/watch-quiz", { method: "POST", body: JSON.stringify(body) });
}

export function suggestQuizQuestions(callerUserId: string, videoUrl: string): Promise<SuggestQuizQuestionsResult> {
  return request(callerUserId, "/agents/campaigns/watch-quiz/suggest-questions", {
    method: "POST",
    body: JSON.stringify({ video_url: videoUrl }),
  });
}

export function getWatchQuizResults(callerUserId: string, campaignId: string): Promise<WatchQuizResults> {
  return request(callerUserId, `/agents/campaigns/watch-quiz/${encodeURIComponent(campaignId)}`, { method: "GET" });
}
