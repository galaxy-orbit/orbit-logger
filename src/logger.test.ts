import { describe, test, expect, beforeEach } from 'bun:test';
import { LoggerService } from './logger.service';
import { JsonFormatter } from './formatters/json.formatter';
import type { LogEntry, LogTransport } from './interfaces/logger.interface';

class MemoryTransport implements LogTransport {
  entries: Array<{ entry: LogEntry; formattedMessage: string }> = [];
  log(entry: LogEntry, formattedMessage: string): void {
    this.entries.push({ entry, formattedMessage });
  }
}

function makeLogger(opts: any = {}) {
  const transport = new MemoryTransport();
  const logger = new LoggerService({ ...opts, transports: [transport] });
  return { logger, transport };
}

describe('LoggerService', () => {
  test('logs through transports with entry fields', () => {
    const { logger, transport } = makeLogger({ level: 'trace' });
    logger.info('hello orbit');
    expect(transport.entries).toHaveLength(1);
    const { entry } = transport.entries[0];
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('hello orbit');
    expect(entry.timestamp).toBeDefined();
  });

  test('context attaches to entries and is chainable', () => {
    const { logger, transport } = makeLogger();
    logger.setContext('UserService').info('created');
    expect(transport.entries[0].entry.context).toBe('UserService');
  });

  test('structured data passes through entry.data', () => {
    const { logger, transport } = makeLogger();
    logger.info('user created', { userId: 42, plan: 'pro' });
    expect(transport.entries[0].entry.data).toEqual({ userId: 42, plan: 'pro' });
  });

  test('correlation id is included', () => {
    const { logger, transport } = makeLogger();
    logger.setCorrelationId('corr-123').warn('degraded');
    expect(transport.entries[0].entry.correlationId).toBe('corr-123');
  });

  test('level filtering: info level hides trace and debug', () => {
    const { logger, transport } = makeLogger({ level: 'info' });
    logger.trace('hidden');
    logger.debug('hidden');
    logger.info('shown');
    logger.warn('shown');
    logger.error('shown');
    expect(transport.entries.map(e => e.entry.level)).toEqual(['info', 'warn', 'error']);
  });

  test('error level only shows error/fatal', () => {
    const { logger, transport } = makeLogger({ level: 'error' });
    logger.info('no');
    logger.error('yes');
    expect(transport.entries).toHaveLength(1);
    expect(transport.entries[0].entry.level).toBe('error');
  });

  test('child logger inherits level and context', () => {
    const { logger, transport } = makeLogger();
    logger.setContext('Parent').setCorrelationId('root-1');
    const child = logger.child('Child');
    child.info('from child');
    expect(transport.entries[0].entry.context).toBe('Child');
    expect(transport.entries[0].entry.correlationId).toBe('root-1');
  });

  test('child logger can override correlation id', () => {
    const { logger, transport } = makeLogger();
    logger.setCorrelationId('root-2');
    const child = logger.child('RequestHandler', 'req-99');
    child.info('handling');
    expect(transport.entries[0].entry.correlationId).toBe('req-99');
  });

  test('time() logs duration for sync functions', () => {
    const { logger, transport } = makeLogger({ level: 'debug' });
    const result = logger.time('sync-task', () => 42);
    expect(result).toBe(42);
    const entry = transport.entries.find(e => e.entry.message === 'sync-task');
    expect(entry).toBeDefined();
    expect((entry!.entry.data as any).duration).toBeGreaterThanOrEqual(0);
  });

  test('time() awaits async functions and logs duration', async () => {
    const { logger, transport } = makeLogger({ level: 'debug' });
    const value = await logger.time('async-task', async () => {
      await Bun.sleep(5);
      return 'result';
    });
    expect(value).toBe('result');
    const entry = transport.entries.find(e => e.entry.message === 'async-task');
    expect(entry).toBeDefined();
    expect((entry!.entry.data as any).duration).toBeGreaterThanOrEqual(4);
  });

  test('time() logs errors and rethrows', async () => {
    const { logger, transport } = makeLogger({ level: 'debug' });
    await expect(logger.time('failing-task', async () => {
      throw new Error('task failed');
    })).rejects.toThrow('task failed');
    const entry = transport.entries.find(e => e.entry.message === 'failing-task');
    expect(entry).toBeDefined();
    expect((entry!.entry.data as any).duration).toBeGreaterThanOrEqual(0);
  });
});

describe('Formatters', () => {
  test('JsonFormatter serializes the full entry', () => {
    const formatter = new JsonFormatter();
    const entry: LogEntry = {
      level: 'error',
      message: 'boom',
      timestamp: '2026-01-01T00:00:00.000Z',
      context: 'Test',
      correlationId: 'c-1',
    };
    const out = JSON.parse(formatter.format(entry));
    expect(out).toEqual({ level: 'error', message: 'boom', timestamp: '2026-01-01T00:00:00.000Z', context: 'Test', correlationId: 'c-1' });
  });

  test('JsonFormatter includes data when present', () => {
    const formatter = new JsonFormatter();
    const out = JSON.parse(formatter.format({ level: 'info', message: 'with data', timestamp: 't', data: { a: 1 } } as any));
    expect(out.data).toEqual({ a: 1 });
  });
});

describe('timestamp formats', () => {
  test('unix format produces numeric string', () => {
    const { logger, transport } = makeLogger({ timestampFormat: 'unix' });
    logger.info('t');
    expect(Number(transport.entries[0].entry.timestamp)).toBeGreaterThan(1_700_000_000_000);
  });

  test('iso format produces ISO string', () => {
    const { logger, transport } = makeLogger({ timestampFormat: 'iso' });
    logger.info('x');
    expect(transport.entries[0].entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
