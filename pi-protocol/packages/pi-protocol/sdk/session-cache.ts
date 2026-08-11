import type { PiSdkAgentSessionFactory, PiSdkAgentSessionLike } from "./index.ts";

export interface SessionCacheIdentity {
  readonly executorId: string;
  readonly principalId: string;
  readonly target: string;
  readonly contractDigest: string;
  readonly sessionId: string;
}

export interface SessionCacheOptions {
  ttlMs?: number;
  maxSessions?: number;
}

interface Entry {
  readonly key: string;
  readonly identity: SessionCacheIdentity;
  readonly creating: Promise<PiSdkAgentSessionLike>;
  session?: PiSdkAgentSessionLike;
  tail: Promise<void>;
  releaseTail?: () => void;
  active: boolean;
  lastUsed: number;
  expiresAt: number;
  timer?: ReturnType<typeof setTimeout>;
  disposeWhenIdle: boolean;
  disposed: boolean;
}

export interface SessionLease {
  readonly session: PiSdkAgentSessionLike;
  readonly cached: boolean;
  readonly key?: string;
  release(keep: boolean): void;
}

const managers = new Set<ProtocolSessionCache>();

export class ProtocolSessionCache {
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly entries = new Map<string, Entry>();
  private disposed = false;

  constructor(options: SessionCacheOptions = {}) {
    this.ttlMs = bounded(options.ttlMs, 15 * 60_000, 1_000, 24 * 60 * 60_000);
    this.maxSessions = bounded(options.maxSessions, 64, 1, 256);
    managers.add(this);
  }

  async acquire(identity: SessionCacheIdentity, createSession: PiSdkAgentSessionFactory): Promise<SessionLease> {
    if (this.disposed) throw new Error("Protocol session cache is disposed");
    this.evictExpired();
    const key = structuredKey(identity);
    this.disposeReplaced(identity, key);
    let entry = this.entries.get(key);
    if (!entry) {
      this.ensureCapacity();
      let creating: Promise<PiSdkAgentSessionLike>;
      try { creating = Promise.resolve(createSession()); }
      catch (error) { creating = Promise.reject(error); }
      entry = {
        key,
        identity,
        creating,
        tail: Promise.resolve(),
        active: false,
        lastUsed: Date.now(),
        expiresAt: Number.POSITIVE_INFINITY,
        disposeWhenIdle: false,
        disposed: false,
      };
      this.entries.set(key, entry);
      void creating.then(
        (session) => { entry!.session = session; if (entry!.disposed) session.dispose(); },
        () => { if (this.entries.get(key) === entry) this.entries.delete(key); },
      );
    }

    const previous = entry.tail;
    let releaseTail!: () => void;
    entry.tail = new Promise<void>((resolve) => { releaseTail = resolve; });
    await previous;
    if (entry.disposed || this.entries.get(key) !== entry) {
      releaseTail();
      throw new Error("Protocol session was replaced or evicted");
    }
    entry.active = true;
    entry.releaseTail = releaseTail;
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = undefined; }
    let session: PiSdkAgentSessionLike;
    try { session = await entry.creating; }
    catch (error) {
      entry.active = false;
      entry.releaseTail?.();
      entry.releaseTail = undefined;
      this.remove(entry);
      throw error;
    }
    let released = false;
    return {
      session,
      cached: true,
      key,
      release: (keep) => {
        if (released) return;
        released = true;
        entry!.active = false;
        entry!.lastUsed = Date.now();
        entry!.releaseTail?.();
        entry!.releaseTail = undefined;
        if (!keep || entry!.disposeWhenIdle || this.disposed) this.remove(entry!);
        else this.scheduleExpiry(entry!);
      },
    };
  }

  async ephemeral(createSession: PiSdkAgentSessionFactory): Promise<SessionLease> {
    const session = await createSession();
    let released = false;
    return {
      session,
      cached: false,
      release: () => { if (!released) { released = true; session.dispose(); } },
    };
  }

  size(): number { return this.entries.size; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    managers.delete(this);
    for (const entry of [...this.entries.values()]) {
      if (entry.active) entry.disposeWhenIdle = true;
      else this.remove(entry);
    }
  }

  private disposeReplaced(identity: SessionCacheIdentity, keepKey: string): void {
    for (const entry of [...this.entries.values()]) {
      if (entry.key === keepKey) continue;
      const old = entry.identity;
      if (old.executorId === identity.executorId && old.principalId === identity.principalId
        && old.target === identity.target && old.sessionId === identity.sessionId
        && old.contractDigest !== identity.contractDigest) {
        if (entry.active) entry.disposeWhenIdle = true;
        else this.remove(entry);
      }
    }
  }

  private ensureCapacity(): void {
    if (this.entries.size < this.maxSessions) return;
    const candidates = [...this.entries.values()].filter((entry) => !entry.active).sort((a, b) => a.lastUsed - b.lastUsed);
    if (!candidates.length) throw new Error("Protocol session cache is full");
    this.remove(candidates[0]);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const entry of [...this.entries.values()]) if (!entry.active && entry.expiresAt <= now) this.remove(entry);
  }

  private scheduleExpiry(entry: Entry): void {
    entry.expiresAt = Date.now() + this.ttlMs;
    entry.timer = setTimeout(() => {
      if (!entry.active && entry.expiresAt <= Date.now()) this.remove(entry);
    }, this.ttlMs);
    entry.timer.unref?.();
  }

  private remove(entry: Entry): void {
    if (entry.disposed) return;
    entry.disposed = true;
    if (entry.timer) clearTimeout(entry.timer);
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    entry.releaseTail?.();
    if (entry.session) entry.session.dispose();
    else void entry.creating.then((session) => session.dispose(), () => undefined);
  }
}

export function getProtocolAgentSessionDiagnostics(): { cacheCount: number; sessionCount: number } {
  return Object.freeze({ cacheCount: managers.size, sessionCount: [...managers].reduce((total, manager) => total + manager.size(), 0) });
}

export function disposeAllProtocolAgentSessions(): void {
  for (const manager of [...managers]) manager.dispose();
}

function structuredKey(identity: SessionCacheIdentity): string {
  return JSON.stringify([
    identity.executorId,
    identity.principalId,
    identity.target,
    identity.contractDigest,
    identity.sessionId,
  ]);
}

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) throw new Error("Invalid protocol session cache limit");
  return candidate;
}
