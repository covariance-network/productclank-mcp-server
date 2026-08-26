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
}

export function getCreditBalance(
  callerUserId: string
): Promise<CreditBalanceResult> {
  return request(callerUserId, "/agents/credits/balance", { method: "GET" });
}
