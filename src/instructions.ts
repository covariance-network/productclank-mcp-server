/**
 * Server instructions — sent once in the `initialize` result, which clients
 * like Claude load into context with the tool list. Prompts and resources
 * (./tools/playbook.ts) are only read when a client chooses to; these are
 * always there. So the one thing every session must get right lives here: how
 * pricing works.
 *
 * Field test (2026-10-21, shared Claude chat): with no pricing model in
 * context, the model web-searched for prices, found the subscription page, and
 * told a founder with $600 to "buy the $199 Growth plan" — when every tool was
 * open to them per action. Keep prices OUT of this text: check_balance returns
 * them live from the API, so a price change never needs an MCP release.
 *
 * Built per profile: the creator profile must never name boost, likes, reposts,
 * watch quizzes or the growth assistant (see ./tools/index.ts).
 */

import type { ToolProfile } from "./tools/index.js";

const PRICING = `How ProductClank pricing works — get this right before you recommend any spend:
- Pay per action, in credits. Every tool is open on every account, including free. An action runs if the balance covers it. The user does NOT need a subscription to try anything — a single small action is a valid first step.
- Call check_balance (free) for the balance AND live prices: pricing.action_costs lists each action in credits with a usd_min–usd_max range. Quote those numbers. Never guess prices or look them up on the web.
- Top-ups are one-off and never expire (pricing.topups; bought at pricing.purchase_url). Plans are optional: a lower price per credit for steady monthly spend. Plan credits reset monthly and do not roll over. Suggest a plan only when the user's planned monthly spend is above that plan's worth_it_above_credits_per_month — otherwise top-ups are cheaper.
- Start small, then scale: run the cheapest test of a play, read its results (free), and put more budget behind what worked. When the user gives you a budget, split it into a first test plus a reserve for what works — do not spend it all up front.`;

const PLAYS: Record<ToolProfile, string> = {
  full: `Pick the play from the user's goal:
- A launch or announcement post needs reach → boost_post on 1–2 anchor posts. Any count works: one reply, three quote posts, ten reposts.
- Be in the conversations where buyers already talk → create_campaign (discovery). Turn on set_campaign_schedule only once drafts are actually being posted.
- A video needs to be watched to the end → create_watch_quiz. A TikTok needing replies, likes and a quiz in one ask → launch_tiktok_campaign.
- Creators making original content about the product → suggest_content_campaign (free dry-run) → create_content_campaign.
- The user's own personal brand → setup_growth_assistant.
- The brand's own posts → the setup_content_space prompt.
Combine plays when the budget allows. Before every paid call, tell the user what it costs in credits and dollars and get a yes.`,
  creator: `Pick the play from the user's goal:
- Be in the conversations where buyers already talk → create_campaign (discovery); creators write their own replies from their own accounts.
- Creators making original content about the product → suggest_content_campaign (free dry-run) → create_content_campaign.
- The brand's own posts → the setup_content_space prompt.
Before every paid call, tell the user what it costs in credits and dollars and get a yes.`,
};

export function serverInstructions(profile: ToolProfile): string {
  return `ProductClank grows products through their community: real people reply to, share and create content about the product from their own accounts.

${PRICING}

${PLAYS[profile]}

Stuck or a tool fails without a clear reason? Call report_issue (free) instead of retrying.`;
}
