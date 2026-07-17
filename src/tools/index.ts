/**
 * MCP tool registry for the ProductClank connector.
 *
 * Tools are grouped by domain, one file each. To add a tool: extend (or add) a
 * domain module that exports a `register<Domain>Tools(server)` function, add its
 * REST call under ../lib/api/, wire it below, and record the endpoint in
 * ../../capabilities.json. See ./README.md for the full checklist.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProductTools } from "./products.js";
import { registerCreditTools } from "./credits.js";
import { registerBoostTools } from "./boost.js";
import { registerContentTools } from "./content.js";
import { registerContentStudioTools } from "./contentStudio.js";

export function registerTools(server: McpServer): void {
  registerProductTools(server); // search_products
  registerCreditTools(server); // check_balance
  registerBoostTools(server); // boost_post
  registerContentTools(server); // suggest_content_campaign, create_content_campaign
  registerContentStudioTools(server); // list_content_spaces, write_content_candidates
}
