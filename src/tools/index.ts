/**
 * MCP tool registry for the ProductClank connector.
 *
 * Tools are grouped by domain, one file each. To add a tool: extend (or add) a
 * domain module that exports a `register<Domain>Tools(server)` function, add its
 * REST call under ../lib/api/, wire it below, and record the endpoint in
 * ../../capabilities.json. See ./README.md for the full checklist.
 *
 * Tools are registered through the analytics proxy (./instrument.ts), so every
 * tool is in the PostHog funnel without a per-tool tracking call.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProductTools } from "./products.js";
import { registerCreditTools } from "./credits.js";
import { registerBoostTools } from "./boost.js";
import { registerContentTools } from "./content.js";
import { registerContentStudioTools } from "./contentStudio.js";
import { registerCampaignTools } from "./campaigns.js";
import { registerParticipationTools } from "./participation.js";
import { registerPlaybook } from "./playbook.js";
import { instrumentTools } from "./instrument.js";

/**
 * Which slice of the tool roster an endpoint serves.
 *
 * - `full`     — every tool. Served at /mcp (Claude, ChatGPT, the registry).
 * - `creator`  — creator-campaign tools only: a brand commissions creators, and
 *                creators get paid for ORIGINAL content they publish from their
 *                own accounts. Served at /creator for Meta's Muse connector
 *                directory.
 *
 * Why `creator` exists: Meta's Spam community standard bans "offering anything
 * of monetary value in exchange for engagement". Every ProductClank tool is a
 * commission for original content EXCEPT boost_post, which buys `likes` and
 * `repost` — pure engagement signals — and accepts Instagram post URLs, a Meta
 * surface. So the Meta-facing profile must not expose boost_post at all.
 *
 * The boundary is the URL, NOT the OAuth client: `tools/list` is in
 * PUBLIC_MCP_METHODS (src/index.ts) so directory health checks can introspect
 * without authenticating, which means a reviewer can list tools before any
 * client identity exists. A separate endpoint is the only filter that holds.
 *
 * Boost returns to the creator profile once Meta has approved the connector.
 */
export type ToolProfile = "full" | "creator";

export function registerTools(
  rawServer: McpServer,
  profile: ToolProfile = "full"
): void {
  const server = instrumentTools(rawServer);
  registerProductTools(server, profile); // search_products, create_product
  registerCreditTools(server, profile); // check_balance, credit_history
  // Engagement-signal tool — excluded from the creator profile (see above).
  if (profile !== "creator") registerBoostTools(server); // boost_post
  registerContentTools(server); // suggest_content_campaign, create_content_campaign
  registerContentStudioTools(server); // list_content_spaces, get_content_workspace, setup_content_space, manage_content_topics, write_content_candidates, get_content_queue, revise_content_draft, teach_content_voice
  registerCampaignTools(server, profile); // create/list/get_campaign, run/get_research, generate/get/review_posts, regenerate_replies, get_campaign_activity/results, update_campaign, set_campaign_schedule, add_delegate
  registerParticipationTools(server, profile); // find_opportunities, submit_participation, get_earnings, find_open_campaigns, get_campaign_brief, submit_campaign_work, get_my_submissions
  registerPlaybook(rawServer, profile); // grow_product + setup_content_space prompts + productclank://capabilities resource
}
