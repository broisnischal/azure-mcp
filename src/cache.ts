// ─── In-process TTL cache ─────────────────────────────────────────────────────
// Keeps user identity, sprint, teams, and path lookups in memory so the AI
// doesn't hammer the API on every message.

interface Entry<T> {
  data: T;
  fetchedAt: number;
  ttlMs: number;
}

export const TTL = {
  USER: 60 * 60_000,     // 1 h
  PROJECT: 60 * 60_000,  // 1 h
  TEAMS: 30 * 60_000,    // 30 m
  SPRINT: 5 * 60_000,    // 5 m
  PATHS: 60 * 60_000,    // 1 h
  REPOS: 5 * 60_000,     // 5 m  — repo list rarely changes
  ITERS: 15 * 60_000,    // 15 m — sprint list rarely changes
  WI: 2 * 60_000,        // 2 m  — individual work item
  WI_LIST: 60_000,       // 1 m  — query results
} as const;

export class Cache {
  private store = new Map<string, Entry<unknown>>();

  /** Return cached value if fresh, otherwise call fetcher, store, and return. */
  async getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const e = this.store.get(key);
    if (e && Date.now() - e.fetchedAt < e.ttlMs) return e.data as T;
    const data = await fetcher();
    this.store.set(key, { data, fetchedAt: Date.now(), ttlMs });
    return data;
  }

  /** Peek without fetching. Returns undefined if absent or expired. */
  peek<T>(key: string): T | undefined {
    const e = this.store.get(key);
    if (e && Date.now() - e.fetchedAt < e.ttlMs) return e.data as T;
    return undefined;
  }

  /** Drop one key or all keys with a given prefix. */
  invalidate(keyOrPrefix?: string): void {
    if (!keyOrPrefix) { this.store.clear(); return; }
    for (const k of this.store.keys()) {
      if (k === keyOrPrefix || k.startsWith(`${keyOrPrefix}:`)) this.store.delete(k);
    }
  }
}
