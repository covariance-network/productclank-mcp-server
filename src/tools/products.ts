/**
 * Products domain — search existing products and list new ones.
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

  server.registerTool(
    "create_product",
    {
      title: "List a product on ProductClank",
      description:
        "List a new product on ProductClank as a token-free listing (no crypto/token, no wallet). At minimum pass a `url` — the server auto-fills the name, tagline, description, logo, and X handle from the site; any field you pass explicitly overrides what's extracted. Socials are optional. Use this when search_products finds no existing match and the user wants to run a boost or campaign for a product that isn't listed yet. Returns the new product's id (and reuses an existing listing if one already matches, rather than duplicating). FREE — no credits charged. Confirm the product details with the user before calling.",
      inputSchema: {
        url: z
          .string()
          .url()
          .optional()
          .describe(
            "Product website URL — auto-fills the listing. Provide this or `name`."
          ),
        name: z
          .string()
          .optional()
          .describe(
            "Product name. Optional if `url` is given (extracted from the site); required otherwise."
          ),
        tagline: z
          .string()
          .optional()
          .describe("One-line value proposition (optional; overrides extracted)."),
        description: z
          .string()
          .optional()
          .describe("Short description of what the product does (optional)."),
        website: z
          .string()
          .url()
          .optional()
          .describe("Canonical website, if different from `url` (optional)."),
        twitter: z
          .string()
          .optional()
          .describe("X/Twitter handle or profile URL (optional)."),
        logo: z
          .string()
          .url()
          .optional()
          .describe("Logo image URL (optional; otherwise auto-resolved from the site)."),
        category: z
          .array(z.string())
          .optional()
          .describe("Category tags (optional)."),
      },
      annotations: {
        readOnlyHint: false,
        // Additive: creates a NEW listing (idempotent per owner); never
        // deletes or overwrites existing data, and charges no credits.
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (
      { url, name, tagline, description, website, twitter, logo, category },
      extra
    ) => {
      const userId = getUserId(extra as ToolExtra);
      if (!userId) return errorResult(NOT_AUTHED);
      if (!url && !name) {
        return errorResult(
          "Provide a product `url` (we'll auto-fill the listing) or at least a `name`."
        );
      }
      try {
        const result = await api.createProduct({
          callerUserId: userId,
          url,
          name,
          tagline,
          description,
          website,
          twitter,
          logo,
          category,
        });
        return textResult({
          product_id: result.product.id,
          name: result.product.name,
          tagline: result.product.tagline,
          website: result.product.website,
          logo: result.product.logo,
          twitter: result.product.twitter,
          listing_type: result.product.listing_type,
          already_listed: result.already_listed,
        });
      } catch (error) {
        return errorResult(
          error instanceof Error ? error.message : "Product listing failed"
        );
      }
    }
  );
}
