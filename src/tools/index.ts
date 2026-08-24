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

export function registerTools(rawServer: McpServer): void {
  const server = instrumentTools(rawServer);
  registerProductTools(server); // search_products, create_product
  registerCreditTools(server); // check_balance, credit_history
  registerBoostTools(server); // boost_post
  registerContentTools(server); // suggest_content_campaign, create_content_campaign
  registerContentStudioTools(server); // list_content_spaces, write_content_candidates
  registerCampaignTools(server); // create/list/get_campaign, run/get_research, generate/get/review_posts, regenerate_replies, add_delegate
  registerParticipationTools(server); // find_opportunities, submit_participation, get_earnings, find_open_campaigns, get_campaign_brief, submit_campaign_work, get_my_submissions
  registerPlaybook(rawServer); // grow_product prompt + productclank://capabilities resource
}
