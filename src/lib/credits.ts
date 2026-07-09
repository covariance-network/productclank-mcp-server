import { getServiceSupabase } from "./supabase.js";

export interface UserBalance {
  balance: number;
  plan: string;
}

/**
 * Read a user's ProductClank credit balance directly from the shared database.
 * Read-only. Used by the check_balance tool (the agent credit-balance endpoint
 * reports the trusted agent's own balance, not the connected user's).
 */
export async function getUserCreditBalance(
  userId: string
): Promise<UserBalance> {
  const { data, error } = await getServiceSupabase()
    .from("UserCredits")
    .select("credit_balance, plan_type")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to read credit balance: ${error.message}`);
  }
  if (!data) {
    return { balance: 0, plan: "free" };
  }
  const row = data as { credit_balance: number | null; plan_type: string | null };
  return { balance: row.credit_balance ?? 0, plan: row.plan_type ?? "free" };
}
