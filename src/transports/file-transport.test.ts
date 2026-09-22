import { describe, test, expect, afterAll } from 'bun:test';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileTransport } from './file.transport';
import { JsonFormatter } from '../formatters/json.formatter';
import type { LogEntry } from '../interfaces/logger.interface';

const dir = mkdtempSync(`${tmpdir()}/orbit-log-`);
const logFile = join(dir, 'test.log');
const formatter = new JsonFormatter();
const transports: FileTransport[] = [];

function makeFileTransport(name: string, opts: any = {}) {
  const t = new FileTransport({ filename: join(dir, name), ...opts });
  transports.push(t);
  return t;
}

function entry(level = 'info', message = 'test message'): LogEntry {
  return { level, message, timestamp: new Date().toISOString() } as LogEntry;
}

afterAll(async () => {
  for (const t of transports) {
    await t.close?.();
  }
});

describe('FileTransport', () => {
  test('flushes buffered entries to disk', async () => {
    const t = makeFileTransport('flush-test.log');
    const entry = { level: 'info' as const, message: 'file message', timestamp: 't' } as LogEntry;
    await t.log(entry, formatter.format(entry));
    await t.flush();
    expect(existsSync(join(dir, 'flush-test.log'))).toBe(true);
  });

  test('written file contains the log line', async () => {
    const t = makeFileTransport('content-test.log');
    const formatted = formatter.format({ level: 'warn' as const, message: 'from file', timestamp: 't' } as any);
    await t.log({ level: 'warn', message: 'from file', timestamp: 't' } as any, formatted);
    await t.flush();
    const content = readFileSync(join(dir, 'content-test.log'), 'utf-8');
    expect(content).toContain('from file');
  });

  test('flush on empty buffer is a safe no-op (file created on init)', async () => {
    const t = makeFileTransport('idempotent.log');
    await t.log({ level: 'info', message: 'seed', timestamp: 't' } as any, 'seed');
    await t.flush();
    await t.flush(); // second flush: nothing buffered, no error
    expect(readFileSync(join(dir, 'idempotent.log'), 'utf-8')).toContain('seed');
  });

  test('creates parent directories automatically', async () => {
    const t = makeFileTransport('nested/deeper/app.log');
    await t.log({ level: 'info', message: 'nested', timestamp: 't' } as any, 'nested');
    await t.flush();
    expect(existsSync(join(dir, 'nested', 'deeper', 'app.log'))).toBe(true);
  });
});
