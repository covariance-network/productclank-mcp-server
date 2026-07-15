/**
 * Products domain — read-only product lookup.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as api from "../lib/api/index.js";
import { getUserId, textResult, errorResult, NOT_AUTHED, type ToolExtra } from "./_shared.js";

export function registerProductTools(server: McpServer): void {
  server.registerTool(
    "search_products",
    {
      title: "Search ProductClank products",
      description:
        "Search the user's ProductClank products by name and return their IDs. A product_id is required to create or boost a campaign — use this to resolve it, then confirm the match with the user.",
      inputSchema: {
        query: z.string().describe("Product name or keyword to search for"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Max results (default 5)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit }, extra) => {
      if (!getUserId(extra as ToolExtra)) return errorResult(NOT_AUTHED);
      try {
        const result = await api.searchProducts(query, limit ?? 5);
        return textResult(result.products ?? []);
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Product search failed"
        );
      }
    }
  );
}
