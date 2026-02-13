import {
  buildSlackSignature,
  verifySlackRequestSignature,
} from "../api/utils/slack-security.js";
import { describe, expect, it } from "vitest";

describe("slack-security", () => {
  const rawBody = JSON.stringify({ type: "event_callback" });
  const signingSecret = "super-secret";
  const timestamp = "1730000000";
  const nowMs = 1730000000 * 1000;

  it("accepts a valid signature within replay window", () => {
    const signature = buildSlackSignature(rawBody, timestamp, signingSecret);

    const result = verifySlackRequestSignature({
      rawBody,
      signature,
      timestamp,
      signingSecret,
      nowMs,
    });

    expect(result).toEqual({ ok: true });
  });

  it("rejects missing auth headers", () => {
    const result = verifySlackRequestSignature({
      rawBody,
      signature: null,
      timestamp,
      signingSecret,
      nowMs,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Unauthorized");
      expect(result.status).toBe(401);
    }
  });

  it("rejects invalid signature prefix", () => {
    const validSignature = buildSlackSignature(rawBody, timestamp, signingSecret);
    const invalidPrefixSignature = validSignature.replace("v0=", "v1=");

    const result = verifySlackRequestSignature({
      rawBody,
      signature: invalidPrefixSignature,
      timestamp,
      signingSecret,
      nowMs,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid signature");
      expect(result.status).toBe(401);
    }
  });

  it("rejects invalid signatures", () => {
    const result = verifySlackRequestSignature({
      rawBody,
      signature: "v0=invalid",
      timestamp,
      signingSecret,
      nowMs,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid signature");
      expect(result.status).toBe(401);
    }
  });

  it("rejects stale requests", () => {
    const signature = buildSlackSignature(rawBody, timestamp, signingSecret);

    const result = verifySlackRequestSignature({
      rawBody,
      signature,
      timestamp,
      signingSecret,
      nowMs: nowMs + 10 * 60 * 1000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Request timeout");
    }
  });

  it("rejects malformed timestamps", () => {
    const result = verifySlackRequestSignature({
      rawBody,
      signature: "v0=invalid",
      timestamp: "not-a-number",
      signingSecret,
      nowMs,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid timestamp");
    }
  });
});
