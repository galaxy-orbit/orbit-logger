import type { LogEntry } from './interfaces/logger.interface';

export interface LogBufferQuery {
  level?: string;
  q?: string;
  requestId?: string;
  /** epoch ms — entries at or after this timestamp */
  from?: number;
  /** epoch ms duration to look back from `to` (or from now when `to` omitted) */
  sinceMs?: number;
  to?: number;
  limit?: number;
}

export type LogListener = (entry: LogEntry) => void;

/**
 * In-memory ring buffer + pub/sub for log entries.
 * Feeds devtools live tail (SSE) and history queries with zero external infra.
 */
export class LogBuffer {
  private items: LogEntry[] = [];
  private listeners = new Set<LogListener>();
  private capacity: number;

  constructor(capacity = 5000) {
    this.capacity = Math.max(1, capacity);
  }

  private toEpoch(value: string): number {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }

  push(entry: LogEntry): void {
    this.items.push(entry);
    if (this.items.length > this.capacity) {
      this.items.splice(0, this.items.length - this.capacity);
    }

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // listener errors must never break logging
        this.listeners.delete(listener);
      }
    }
  }

  entries(query: LogBufferQuery = {}): LogEntry[] {
    let list = this.items;
    if (query.level) list = list.filter((e) => e.level === query.level);
    if (query.requestId) list = list.filter((e) => e.correlationId === query.requestId);
    if (query.q) {
      const q = query.q.toLowerCase();
      list = list.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          (e.context ?? '').toLowerCase().includes(q) ||
          (e.error?.message ?? '').toLowerCase().includes(q)
      );
    }
    if (query.from !== undefined) {
      list = list.filter((e) => this.toEpoch(e.timestamp) >= query.from!);
    }
    if (query.to !== undefined) {
      list = list.filter((e) => this.toEpoch(e.timestamp) <= query.to!);
    }
    if (query.sinceMs !== undefined) {
      const cutoff = (query.to ?? Date.now()) - query.sinceMs;
      list = list.filter((e) => this.toEpoch(e.timestamp) >= cutoff);
    }
    return list.slice(-Math.min(query.limit ?? 500, this.capacity));
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}

let globalBuffer: LogBuffer | undefined;

/** Shared buffer used by every LoggerService by default. */
export function getGlobalLogBuffer(): LogBuffer {
  if (!(globalThis as any).__orbitLogBuffer) {
    (globalThis as any).__orbitLogBuffer = new LogBuffer();
  }
  return (globalThis as any).__orbitLogBuffer;
}

export function setGlobalLogBuffer(buffer: LogBuffer): void {
  (globalThis as any).__orbitLogBuffer = buffer;
}
