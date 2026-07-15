/**
 * ProductClank Agent REST API client — barrel.
 *
 * Import as `import * as api from "../lib/api/index.js"`. Each domain file owns
 * its typed request functions; add a new endpoint by extending the matching
 * domain (or adding a new domain file) and re-exporting it here.
 */

export { ApiError, request } from "./client.js";
export * from "./authorize.js";
export * from "./products.js";
export * from "./boost.js";
export * from "./content.js";
