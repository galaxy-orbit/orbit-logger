import { describe, test, expect } from 'bun:test';
import { LogBuffer, getGlobalLogBuffer } from './log-buffer';
import { LoggerService } from './logger.service';
import type { LogEntry } from './interfaces/logger.interface';

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: 'info',
    message: 'hello',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('LogBuffer', () => {
  test('ring buffer evicts oldest beyond capacity', () => {
    const buf = new LogBuffer(3);
    for (let i = 0; i < 5; i++) buf.push(entry({ message: `m${i}` }));
    // entries() default limit is 500 — ring holds 3, so all 5 are not kept
    expect(buf.entries().map((e) => e.message)).toEqual(['m2', 'm3', 'm4']);
  });

  test('filter by level', () => {
    const buf = new LogBuffer();
    buf.push(entry({ level: 'info', message: 'ok' }));
    buf.push(entry({ level: 'error', message: 'bad' }));
    expect(buf.entries({ level: 'error' }).map((e) => e.message)).toEqual(['bad']);
  });

  test('filter by text query across message/context/error', () => {
    const buf = new LogBuffer();
    buf.push(entry({ message: 'UserService created' }));
    buf.push(entry({ message: 'other', context: 'AuthModule' }));
    buf.push(entry({ message: 'boom', error: { name: 'Error', message: 'DB down' } }));
    expect(buf.entries({ q: 'userservice' }).length).toBe(1);
    expect(buf.entries({ q: 'authmodule' }).length).toBe(1);
    expect(buf.entries({ q: 'db' }).length).toBe(1);
  });

  test('filter by requestId/correlationId', () => {
    const buf = new LogBuffer();
    buf.push(entry({ message: 'a', correlationId: 'req-1' }));
    buf.push(entry({ message: 'b', correlationId: 'req-2' }));
    expect(buf.entries({ requestId: 'req-1' }).map((e) => e.message)).toEqual(['a']);
  });

  test('time filters (from/to/sinceMs)', async () => {
    const buf = new LogBuffer();
    buf.push(entry({ message: 'old', timestamp: new Date(Date.now() - 60_000).toISOString() }));
    buf.push(entry({ message: 'recent', timestamp: new Date().toISOString() }));
    const from = Date.now() - 30_000;
    expect(buf.entries({ from }).map((e) => e.message)).toEqual(['recent']);
    expect(buf.entries({ sinceMs: 30_000 }).map((e) => e.message)).toEqual(['recent']);
  });

  test('limit returns most recent entries', () => {
    const buf = new LogBuffer();
    for (let i = 0; i < 10; i++) buf.push(entry({ message: `m${i}` }));
    expect(buf.entries({ limit: 3 }).map((e) => e.message)).toEqual(['m7', 'm8', 'm9']);
  });

  test('subscribe receives new entries; unsubscribe stops', () => {
    const buf = new LogBuffer();
    const seen: LogEntry[] = [];
    const unsub = buf.subscribe((e) => seen.push(e));
    buf.push(entry({ message: 'one' }));
    unsub();
    buf.push(entry({ message: 'two' }));
    expect(seen.map((e) => e.message)).toEqual(['one']);
  });

  test('listener throwing does not break logging', () => {
    const buf = new LogBuffer();
    buf.subscribe(() => { throw new Error('listener bug'); });
    const seen: string[] = [];
    buf.subscribe((e) => seen.push(e.message));
    buf.push(entry({ message: 'still logged' }));
    expect(seen).toEqual(['still logged']);
expect(buf.size()).toBe(1);
  });
});

describe('LoggerService + LogBuffer integration', () => {
  test('default service writes to the global buffer', () => {
    const buf = getGlobalLogBuffer();
    const before = buf.size();
    const svc = new LoggerService();
    svc.info('into the buffer', { key: 'value' });
    expect(buf.size()).toBe(before + 1);
    const last = buf.entries({ limit: 1 })[0];
    expect(last.message).toBe('into the buffer');
    expect(last.data).toEqual({ key: 'value' });
  });

  test('buffer: false disables buffering', () => {
    const buf = getGlobalLogBuffer();
    const before = buf.size();
    const svc = new LoggerService({ buffer: false });
    svc.info('not buffered');
    expect(buf.size()).toBe(before);
  });

  test('custom buffer instance receives entries', () => {
    const buf = new LogBuffer();
    const svc = new LoggerService({ buffer: buf });
    svc.error('boom', new Error('test'));
    const entries = buf.entries({ level: 'error' });
    expect(entries.length).toBe(1);
    expect(entries[0].error?.message).toBe('test');
  });

  test('child logger shares the parent buffer', () => {
    const buf = new LogBuffer();
    const parent = new LoggerService({ buffer: buf });
    const child = parent.child('Child');
    child.info('from child');
    const messages = buf.entries().map((e) => e.message);
    expect(messages).toContain('from child');
  });
});
