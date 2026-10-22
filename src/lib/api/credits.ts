/**
 * Credits — balance lookup via the agent REST API.
 *
 * With per-user agents, GET /agents/credits/balance reads Agent.user_id — which
 * IS the connected user — so the old direct-Supabase workaround (lib/credits.ts,
 * needed when the shared trusted agent's own balance was the wrong number) is
 * gone. One less reason for this server to hold the service-role key.
 */

import { request } from "./client.js";

export interface CreditBalanceResult {
  success: boolean;
  balance: number;
  plan: string;
  lifetime_purchased: number;
  lifetime_used: number;
  lifetime_bonus: number;
  /** Purchased credits inside `balance` — never expire. Absent on app builds before the pricing release. */
  topup_balance?: number;
  /** Live pricing model from the app. Absent on app builds before the pricing release. */
  pricing?: CreditPricing;
}

export interface ActionCost {
  action: string;
  credits: number;
  unit: string;
  note?: string;
  usd_min: number;
  usd_max: number;
}

export interface PlaySize {
  size: "test" | "standard" | "scale";
  what: string;
  /** up_front = charged at launch; up_to = a cap billed as people act; per_month = recurring. */
  billing: "up_front" | "up_to" | "per_month";
  items: { label: string; credits: number }[];
  credits: number;
  usd_min: number;
  usd_max: number;
}

export interface Play {
  play: string;
  tool: string;
  goal: string;
  fits: string;
  results_tool: string;
  sizes: PlaySize[];
}

export interface PlaySubscription {
  play: string;
  tool: string;
  goal: string;
  fits: string;
  price_usd_per_month: number;
  price_usd_per_year: number | null;
  credits_included_per_month: number;
  first_run: string;
  note: string;
}

export interface CreditPricing {
  model: string;
  summary: string;
  action_costs: ActionCost[];
  /** Each play at test / standard / scale. Absent on app builds before the play-recipes release. */
  plays?: Play[];
  /** Dollar-priced plays (the growth assistant). Absent on older app builds. */
  subscriptions?: PlaySubscription[];
  topups: { price_usd: number; credits: number; usd_per_credit: number }[];
  custom_topup?: string;
  plans: {
    id: string;
    name: string;
    price_usd_per_month: number;
    credits_per_month: number;
    usd_per_credit: number;
    cheaper_than_largest_topup: boolean;
    worth_it_above_credits_per_month: number;
  }[];
  purchase_url: string;
  plans_url?: string;
}

export function getCreditBalance(
  callerUserId: string
): Promise<CreditBalanceResult> {
  return request(callerUserId, "/agents/credits/balance", { method: "GET" });
}
