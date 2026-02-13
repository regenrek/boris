import { createHmac, timingSafeEqual } from "crypto";

const SIGNATURE_VERSION = "v0";
const DEFAULT_MAX_AGE_SECONDS = 60 * 5;

export interface VerifySlackRequestInput {
  rawBody: string;
  signature?: string | null;
  timestamp?: string | null;
  signingSecret?: string | null;
  nowMs?: number;
  maxAgeSeconds?: number;
}

export type VerifySlackRequestResult =
  | { ok: true }
  | { ok: false; status: 401; error: string };

function constantTimeCompare(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function buildSlackSignature(
  rawBody: string,
  timestamp: string,
  signingSecret: string
): string {
  const baseString = `${SIGNATURE_VERSION}:${timestamp}:${rawBody}`;
  return `${SIGNATURE_VERSION}=${createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex")}`;
}

export function verifySlackRequestSignature(
  input: VerifySlackRequestInput
): VerifySlackRequestResult {
  const { rawBody, signature, timestamp, signingSecret } = input;

  if (!signature || !timestamp || !signingSecret) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const requestTime = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(requestTime)) {
    return { ok: false, status: 401, error: "Invalid timestamp" };
  }

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const maxAgeSeconds = input.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  if (Math.abs(nowSeconds - requestTime) > maxAgeSeconds) {
    return { ok: false, status: 401, error: "Request timeout" };
  }

  if (!signature.startsWith(`${SIGNATURE_VERSION}=`)) {
    return { ok: false, status: 401, error: "Invalid signature" };
  }

  const expected = buildSlackSignature(rawBody, timestamp, signingSecret);
  if (!constantTimeCompare(expected, signature)) {
    return { ok: false, status: 401, error: "Invalid signature" };
  }

  return { ok: true };
}
