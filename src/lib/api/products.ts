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

export interface CreateProductParams {
  callerUserId: string;
  /** Product website URL — server auto-fills name/tagline/description/logo/X from it. */
  url?: string;
  /** Explicit fields override anything auto-extracted from `url`. */
  name?: string;
  tagline?: string;
  description?: string;
  website?: string;
  /** X/Twitter handle or full URL (optional). */
  twitter?: string;
  logo?: string;
  category?: string[];
}

export interface CreateProductResult {
  success: boolean;
  already_listed: boolean;
  product: {
    id: string;
    name: string;
    tagline: string | null;
    website: string | null;
    logo: string | null;
    category: string[];
    twitter: string | null;
    listing_type: string;
  };
}

/**
 * List a product as a token-free listing (LIST_WITHOUT_TOKEN). Pass a `url` to
 * auto-fill from the site; explicit fields override. Idempotent per owner.
 * Wraps POST /agents/products (free).
 */
export function createProduct(
  params: CreateProductParams
): Promise<CreateProductResult> {
  const { callerUserId, ...rest } = params;
  return request("/agents/products", {
    method: "POST",
    body: JSON.stringify({
      caller_user_id: callerUserId,
      ...(rest.url ? { url: rest.url } : {}),
      ...(rest.name ? { name: rest.name } : {}),
      ...(rest.tagline ? { tagline: rest.tagline } : {}),
      ...(rest.description ? { description: rest.description } : {}),
      ...(rest.website ? { website: rest.website } : {}),
      ...(rest.twitter ? { twitter: rest.twitter } : {}),
      ...(rest.logo ? { logo: rest.logo } : {}),
      ...(rest.category ? { category: rest.category } : {}),
    }),
  });
}
