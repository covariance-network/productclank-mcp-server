#!/usr/bin/env node
/**
 * MCP <-> agent-skill parity check.
 *
 * The ProductClank agent REST API is the source of truth; the agent skill and
 * this MCP server are both wrappers. This script fetches the skill's docs from
 * GitHub, extracts every agent endpoint it references, and verifies each one is
 * accounted for in capabilities.json (as a live/planned/excluded entry).
 *
 * DRIFT = the skill references an endpoint that capabilities.json doesn't list.
 * That means a new skill capability landed and we must decide its MCP status.
 *
 * Exit codes: 0 = in sync (or network unavailable), 1 = drift detected.
 * Run: node scripts/check-skill-parity.mjs
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Normalize an endpoint path to the canonical form used in capabilities.json. */
function normalize(raw) {
  let s = raw.trim();
  s = s.replace(/^https?:\/\/[^/]+/i, ""); // strip origin
  s = s.replace(/\?.*$/, ""); // strip query string
  s = s.replace(/^\/api\/v1/i, ""); // strip API version prefix
  if (s.startsWith("/participate")) s = "/agents" + s; // participation base
  s = s.replace(/\{[^}]+\}/g, "{id}"); // collapse path params
  s = s.replace(/\/+$/, ""); // strip trailing slash
  return s;
}

const ENDPOINT_RE =
  /\b(GET|POST|PUT|PATCH|DELETE)\b\s*[|`"']*\s*((?:https?:\/\/[^\s`"'|)]+)?\/(?:api\/v1\/)?(?:agents|participate)[A-Za-z0-9/_{}?=&.-]*)/gi;

function extractEndpoints(markdown) {
  const found = new Map(); // key -> {method, path}
  let m;
  while ((m = ENDPOINT_RE.exec(markdown)) !== null) {
    const method = m[1].toUpperCase();
    const path = normalize(m[2]);
    if (!path.startsWith("/agents")) continue;
    found.set(`${method} ${path}`, { method, path });
  }
  return found;
}

async function main() {
  const cfg = JSON.parse(await readFile(join(ROOT, "capabilities.json"), "utf8"));
  const known = new Set(
    cfg.endpoints.map((e) => `${e.method.toUpperCase()} ${normalize(e.path)}`)
  );

  const base = `https://raw.githubusercontent.com/${cfg.skillRepo}/${cfg.skillBranch}`;
  const skillEndpoints = new Map();
  let fetchFailed = false;

  for (const doc of cfg.skillDocs) {
    const url = `${base}/${doc}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`  ! could not fetch ${doc} (HTTP ${res.status})`);
        fetchFailed = true;
        continue;
      }
      for (const [key, ep] of extractEndpoints(await res.text())) {
        if (!skillEndpoints.has(key)) skillEndpoints.set(key, { ...ep, doc });
      }
    } catch (err) {
      console.warn(`  ! could not fetch ${doc}: ${err.message}`);
      fetchFailed = true;
    }
  }

  if (skillEndpoints.size === 0 && fetchFailed) {
    console.warn(
      "\n⚠️  Skill docs unreachable (offline/rate-limited) — skipping parity check (non-blocking)."
    );
    process.exit(0);
  }

  // Drift: endpoints the skill references that we don't track at all.
  const drift = [...skillEndpoints.keys()].filter((k) => !known.has(k)).sort();

  // Reminders: what's tracked-but-not-yet-built.
  const planned = cfg.endpoints
    .filter((e) => e.mcp === "planned")
    .map((e) => `${e.method} ${e.path}${e.tier ? `  (tier ${e.tier})` : ""}${e.tool ? ` -> ${e.tool}` : ""}`);
  const live = cfg.endpoints.filter((e) => e.mcp === "live");
  const excluded = cfg.endpoints.filter((e) => e.mcp === "excluded");

  console.log("ProductClank MCP <-> skill parity");
  console.log("─".repeat(48));
  console.log(`  skill endpoints referenced : ${skillEndpoints.size}`);
  console.log(`  capabilities.json entries  : ${cfg.endpoints.length}`);
  console.log(`    live     : ${live.length}`);
  console.log(`    planned  : ${planned.length}`);
  console.log(`    excluded : ${excluded.length}`);

  if (planned.length) {
    console.log("\n📋 Planned (in skill, not yet an MCP tool):");
    for (const p of planned) console.log(`   • ${p}`);
  }

  if (drift.length) {
    console.error("\n❌ DRIFT — skill references endpoints missing from capabilities.json:");
    for (const k of drift) {
      const ep = skillEndpoints.get(k);
      console.error(`   • ${k}   (seen in ${ep.doc})`);
    }
    console.error(
      "\nAdd each to capabilities.json with an `mcp` status (live | planned | excluded),\n" +
        "then decide whether it becomes a tool. See CAPABILITIES.md."
    );
    process.exit(1);
  }

  console.log("\n✅ In sync — every skill endpoint is accounted for in capabilities.json.");
  process.exit(0);
}

main().catch((err) => {
  console.error("parity check crashed:", err);
  process.exit(1);
});
