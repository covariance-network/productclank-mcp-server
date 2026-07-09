import crypto from "node:crypto";
import { config } from "../config.js";

/**
 * Audience claim shared by the ProductClank webapp (signer) and this server
 * (verifier). Keep this string identical on both sides.
 */
export const GRANT_AUDIENCE = "productclank-mcp-connector";

export interface GrantPayload {
  userId: string;
}

function decodeSegment(segment: string): Buffer {
  return Buffer.from(segment, "base64url");
}

/**
 * Verify a short-lived HS256 grant token minted by the ProductClank webapp after
 * the user logs in and approves the connection. Returns the ProductClank User id.
 * Throws on any validation failure (bad signature, wrong audience, expired).
 */
export function verifyGrant(token: string): GrantPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed grant token");
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  const expected = crypto
    .createHmac("sha256", config.grantSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const provided = decodeSegment(signatureB64);
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    throw new Error("Invalid grant signature");
  }

  const header = JSON.parse(decodeSegment(headerB64).toString("utf8")) as {
    alg?: string;
  };
  if (header.alg !== "HS256") {
    throw new Error("Unsupported grant algorithm");
  }

  const payload = JSON.parse(decodeSegment(payloadB64).toString("utf8")) as {
    sub?: string;
    aud?: string;
    exp?: number;
  };
  if (payload.aud !== GRANT_AUDIENCE) {
    throw new Error("Invalid grant audience");
  }
  if (
    typeof payload.exp !== "number" ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Grant token expired");
  }
  if (!payload.sub) {
    throw new Error("Grant token missing subject");
  }
  return { userId: payload.sub };
}
