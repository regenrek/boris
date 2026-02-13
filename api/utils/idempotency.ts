interface IdempotencyStoreOptions {
  ttlMs?: number;
  maxSize?: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_SIZE = 10_000;

export class InMemoryIdempotencyStore {
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly entries = new Map<string, number>();

  constructor(options: IdempotencyStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  }

  has(key: string, nowMs = Date.now()): boolean {
    this.prune(nowMs);
    const expiresAt = this.entries.get(key);

    if (!expiresAt) {
      return false;
    }

    if (expiresAt <= nowMs) {
      this.entries.delete(key);
      return false;
    }

    return true;
  }

  add(key: string, nowMs = Date.now()): void {
    this.prune(nowMs);

    if (this.entries.size >= this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) {
        this.entries.delete(oldestKey);
      }
    }

    this.entries.set(key, nowMs + this.ttlMs);
  }

  private prune(nowMs: number): void {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= nowMs) {
        this.entries.delete(key);
      }
    }
  }
}
