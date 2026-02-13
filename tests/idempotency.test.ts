import { InMemoryIdempotencyStore } from "../api/utils/idempotency.js";
import { describe, expect, it } from "vitest";

describe("InMemoryIdempotencyStore", () => {
  it("stores keys until ttl expires", () => {
    const store = new InMemoryIdempotencyStore({ ttlMs: 100, maxSize: 10 });

    expect(store.has("event-1", 1_000)).toBe(false);
    store.add("event-1", 1_000);
    expect(store.has("event-1", 1_050)).toBe(true);
    expect(store.has("event-1", 1_101)).toBe(false);
  });

  it("evicts oldest key when max size is reached", () => {
    const store = new InMemoryIdempotencyStore({ ttlMs: 1_000, maxSize: 2 });

    store.add("event-1", 1_000);
    store.add("event-2", 1_001);
    store.add("event-3", 1_002);

    expect(store.has("event-1", 1_003)).toBe(false);
    expect(store.has("event-2", 1_003)).toBe(true);
    expect(store.has("event-3", 1_003)).toBe(true);
  });
});
