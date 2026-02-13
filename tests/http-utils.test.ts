import { fetchJsonWithRetry, fetchWithRetry } from "../api/utils/http.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("http utils", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("retries on retriable status codes", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("temporary", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const { response, data } = await fetchJsonWithRetry<{ ok: boolean }>(
      "https://example.com/api",
      {},
      { retries: 1, retryDelayMs: 0 }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it("does not retry non-retriable status codes", async () => {
    fetchMock.mockResolvedValue(new Response("bad request", { status: 400 }));

    const response = await fetchWithRetry(
      "https://example.com/api",
      {},
      { retries: 3, retryDelayMs: 0 }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(400);
  });

  it("supports caller abort signal", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));

    const response = await fetchWithRetry("https://example.com/api", {
      signal: controller.signal,
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeDefined();
  });

  it("throws generic error when non-Error values are thrown", async () => {
    fetchMock.mockRejectedValue({ message: "unknown" });

    await expect(
      fetchWithRetry("https://example.com/api", {}, { retries: 0, retryDelayMs: 0 })
    ).rejects.toThrow("HTTP request failed after retries");
  });

  it("throws after exhausting retries on network errors", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(
      fetchWithRetry("https://example.com/api", {}, { retries: 1, retryDelayMs: 0 })
    ).rejects.toThrow("network down");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
