/**
 * Spaces a campaign can run in (members-only).
 *
 * - listCampaignSpaces → GET /api/v1/agents/spaces
 *
 * Every campaign create tool takes the returned `id` as `space_id` to run
 * members-only in that space (Stars, never the public network).
 */
import { request } from "./client.js";

export interface CampaignSpace {
  id: string;
  name: string;
  description: string | null;
  /** owner = the user's own space; delegate = run on someone else's behalf. */
  role: "owner" | "delegate";
  /** Members who can take work (the owner excluded). 0 = cannot run a campaign yet. */
  member_count: number;
  can_run_campaigns: boolean;
}

export interface ListCampaignSpacesResult {
  success: boolean;
  spaces: CampaignSpace[];
  next_step?: string;
}

export function listCampaignSpaces(callerUserId: string): Promise<ListCampaignSpacesResult> {
  return request(callerUserId, "/agents/spaces", { method: "GET" });
}
