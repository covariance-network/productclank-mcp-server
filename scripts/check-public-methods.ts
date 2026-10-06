/**
 * Invariant check for which MCP requests may skip bearer auth.
 *
 *   npm run check:public
 *
 * Guards: discovery methods stay public; resources/read is public ONLY for the
 * static allowlist; anything that acts for a user (tools/call, prompts/get,
 * other resources) still needs a token; a batch is public only if every
 * message is. Exits 1 on any failure.
 */
import {
  CAPABILITIES_RESOURCE_URI,
  PUBLIC_RESOURCE_URIS,
  isPublicMcpMessage,
  isPublicMcpRequest,
} from "../src/auth/public-methods.js";

let fails = 0;
const ok = (name: string, cond: boolean) => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}`);
  if (!cond) fails++;
};
const msg = (method: string, params?: unknown) => ({ jsonrpc: "2.0", id: 1, method, params });

console.log("Public without a token");
for (const m of ["initialize", "ping", "tools/list", "prompts/list", "resources/list", "resources/templates/list"]) {
  ok(m, isPublicMcpMessage(msg(m)));
}
ok("notifications/initialized", isPublicMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }));
ok(`resources/read ${CAPABILITIES_RESOURCE_URI}`, isPublicMcpMessage(msg("resources/read", { uri: CAPABILITIES_RESOURCE_URI })));
ok("the allowlist is exactly the capabilities resource", PUBLIC_RESOURCE_URIS.size === 1 && PUBLIC_RESOURCE_URIS.has(CAPABILITIES_RESOURCE_URI));

console.log("\nStill needs a token");
ok("tools/call", !isPublicMcpMessage(msg("tools/call", { name: "check_balance", arguments: {} })));
ok("prompts/get", !isPublicMcpMessage(msg("prompts/get", { name: "grow_product" })));
ok("resources/read of any other URI", !isPublicMcpMessage(msg("resources/read", { uri: "productclank://campaigns/123" })));
ok("resources/read with a near-miss URI", !isPublicMcpMessage(msg("resources/read", { uri: `${CAPABILITIES_RESOURCE_URI}/../secrets` })));
ok("resources/read without params", !isPublicMcpMessage(msg("resources/read")));
ok("resources/read with a non-string uri", !isPublicMcpMessage(msg("resources/read", { uri: ["productclank://capabilities"] })));
ok("resources/subscribe", !isPublicMcpMessage(msg("resources/subscribe", { uri: CAPABILITIES_RESOURCE_URI })));
ok("missing method", !isPublicMcpMessage({ jsonrpc: "2.0", id: 1 }));
ok("non-object", !isPublicMcpMessage("initialize"));

console.log("\nRequests (single + batch)");
ok("single public read", isPublicMcpRequest(msg("resources/read", { uri: CAPABILITIES_RESOURCE_URI })));
ok("all-public batch", isPublicMcpRequest([msg("initialize"), msg("resources/read", { uri: CAPABILITIES_RESOURCE_URI })]));
ok("batch smuggling tools/call is gated", !isPublicMcpRequest([msg("resources/read", { uri: CAPABILITIES_RESOURCE_URI }), msg("tools/call", { name: "x" })]));
ok("empty batch is gated", !isPublicMcpRequest([]));
ok("empty body is gated", !isPublicMcpRequest(undefined));

console.log(fails === 0 ? "\nAll public-method checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
