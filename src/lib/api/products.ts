/**
 * Products — lookup for resolving a product_id (required to create/boost).
 */

import { request } from "./client.js";

export interface ProductSearchResult {
  success: boolean;
  products: Array<{
    id: string;
    name: string;
    tagline?: string;
    website?: string;
    twitter?: string;
    category?: string[];
  }>;
}

export function searchProducts(
  query: string,
  limit: number
): Promise<ProductSearchResult> {
  const qs = new URLSearchParams({ q: query, limit: String(limit) });
  return request(`/agents/products/search?${qs.toString()}`, { method: "GET" });
}
