import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client (bypasses RLS). Backs the MCP OAuth token store
 * and reads a user's credit balance. This holds the service-role key — never
 * expose it to clients.
 */
export function getServiceSupabase(): SupabaseClient {
  if (!cached) {
    cached = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
