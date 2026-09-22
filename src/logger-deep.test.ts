import { describe, test, expect, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrettyFormatter } from './formatters/pretty.formatter';
import { Log, getLogMetadata } from './decorators/log.decorator';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { LoggerService } from './logger.service';

function makeCollectingLogger() {
  const entries: any[] = [];
  const logger = new LoggerService({ level: 'trace' } as any);
  // capture entries by injecting a spy transport
  (logger as any).transports = [{
    log: async (entry: any) => { entries.push(entry); },
    close: async () => {},
  }];
  return { logger, entries };
}

describe('PrettyFormatter', () => {
  const makeEntry = (overrides: any = {}) => ({
    level: 'info',
    message: 'hello orbit',
    timestamp: new Date('2026-01-15T10:30:45Z').getTime(),
    ...overrides,
  });

  test('renders time, level, message', () => {
    const out = new PrettyFormatter(false).format(makeEntry() as any);
    expect(out).toContain('[10:30:45]');
    expect(out).toContain('INFO ');
    expect(out).toContain('hello orbit');
  });

  test('context and correlationId appear when present', () => {
    const out = new PrettyFormatter(false).format(makeEntry({
      context: 'HTTP', correlationId: 'abcdef1234567890',
    }) as any);
    expect(out).toContain('[HTTP]');
    expect(out).toContain('(abcdef12)'); // sliced to 8 chars
  });

  test('duration appends +Nms', () => {
    const out = new PrettyFormatter(false).format(makeEntry({ duration: 42 }) as any);
    expect(out).toContain('+42ms');
  });

  test('data block pretty-prints JSON', () => {
    const out = new PrettyFormatter(false).format(makeEntry({
      data: { userId: 7 },
    }) as any);
    expect(out).toContain('Data:');
    expect(out).toContain('"userId": 1'.replace('1', '7'));
  });

  test('error section includes name, message, and up to 3 stack lines', () => {
    const error = new Error('boom');
    const out = new PrettyFormatter(false).format(makeEntry({ error }) as any);
    expect(out).toContain('Error: Error: boom');
    expect(out.split('\n').filter((l) => l.trim().startsWith('at ')).length).toBeLessThanOrEqual(3);
  });

  test('colorize: true emits ANSI codes, false does not', () => {
    const colored = new PrettyFormatter(true).format(makeEntry() as any);
    expect(colored).toContain('\x1b[');
    const plain = new PrettyFormatter(false).format(makeEntry() as any);
    expect(plain).not.toContain('\x1b[');
  });
});

describe('@Log decorator', () => {
  function makeSpyLogger() {
    const entries: any[] = [];
    const logger = {
      log: (level: any, msg: any, data: any) => entries.push({ level, msg, data }),
      error: (msg: any, err: any, data: any) => entries.push({ level: 'error', msg, data }),
    };
    return { logger, entries };
  }

  class Billing {
    logger: any;

    @Log({ message: 'charge card', logArgs: true, logResult: true })
    async charge(amount: number) { return { charged: amount }; }
  }

  test('logs started/completed with args, result and duration', async () => {
    const svc = new Billing();
    const entries: any[] = [];
    (svc as any).logger = {
      log: (level: any, msg: any, data: any) => entries.push({ level, msg, data }),
      error: () => {},
    };

    await svc.charge(100);

    expect(entries).toHaveLength(2);
    expect(entries[0].msg).toContain('charge card - started');
    expect(entries[0].data.args).toEqual([100]);
    expect(entries[1].msg).toContain('charge card - completed');
    expect(entries[1].data.duration).toBeGreaterThanOrEqual(0);
    expect(entries[1].data.result).toEqual({ charged: 100 });
  });

  class Failing {
    logger: any;

    @Log()
    async failing() { throw new Error('payment declined'); }
  }

  test('failures log at error level and rethrow', async () => {
    const svc = new Failing();
    const errors: any[] = [];
    (svc as any).logger = {
      log: () => {},
      error: (msg: any) => errors.push(String(msg)),
    };

    await expect(svc.failing()).rejects.toThrow('payment declined');
    expect(errors[0]).toContain('failing - failed');
  });

  class BareService {
    @Log()
    async work() { return 'bare'; }
  }

  test('methods without this.logger execute silently', async () => {
    const svc = new BareService();
    expect(await svc.work()).toBe('bare');
  });

  test('getLogMetadata returns the resolved options', () => {
    class Meta {
      @Log({ level: 'warn', logArgs: true })
      run() {}
    }
    const meta = getLogMetadata(Meta.prototype, 'run');
    expect(meta).toMatchObject({ level: 'warn', message: 'run', logArgs: true, logDuration: true });
  });
});

describe('RequestLoggerMiddleware', () => {
  const servers: any[] = [];
  afterAll(() => {
    for (const s of servers) s.stop(true);
  });

  function makeLogger() {
    const entries: any[] = [];
    // the middleware chains child('HTTP').child('Request', corr)
    const leaf = {
      log: (level: any, msg: any, data: any) => entries.push({ level, msg, data }),
      error: (msg: any, err: any, data: any) => entries.push({ level: 'error', msg, data }),
      setCorrelationId: () => {},
      child: () => leaf,
    };
    const logger = { child: () => leaf };
    return { logger, entries };
  }

  test('logs the request and response with duration, adds correlation id header', async () => {
    const { logger, entries } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger as any);

    const response = await middleware.use(
      new Request('http://localhost/api/things'),
      async () => new Response('ok', { status: 200 }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBeDefined();

    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries[0].msg).toBe('GET /api/things');
    expect(entries[1].msg).toBe('GET /api/things 200');
    expect(entries[1].data.duration).toBeGreaterThanOrEqual(0);
  });

  test('skips excluded paths without logging', async () => {
    const { logger, entries } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger as any);

    const response = await middleware.use(
      new Request('http://localhost/health'),
      async () => new Response('healthy'),
    );

    expect(response.status).toBe(200);
    expect(entries).toHaveLength(0);
  });

  test('redacts sensitive headers in the request log', async () => {
    const { logger, entries } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger as any);

    await middleware.use(
      new Request('http://localhost/secure', {
        headers: { authorization: 'Bearer secret-token', 'x-api-key': 'key-1', 'x-safe': 'visible' },
      }),
      async () => new Response('ok'),
    );

    const headers = entries[0].data.headers;
    expect(headers['authorization']).toBe('[REDACTED]');
    expect(headers['x-api-key']).toBe('[REDACTED]');
    expect(headers['x-safe']).toBe('visible');
  });

  test('4xx/5xx responses escalate the log level', async () => {
    const { logger, entries } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger as any);

    await middleware.use(
      new Request('http://localhost/missing'),
      async () => new Response('nope', { status: 404 }),
    );
    expect(entries[1].level).toBe('warn');

    await middleware.use(
      new Request('http://localhost/broken'),
      async () => new Response('oops', { status: 500 }),
    );
    expect(entries[3].level).toBe('error');
  });

  test('handler errors log at error level and propagate', async () => {
    const { logger, entries } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger as any);

    await expect(middleware.use(
      new Request('http://localhost/crash'),
      async () => { throw new Error('route exploded'); },
    )).rejects.toThrow('route exploded');

    expect(entries.some((e) => e.level === 'error' && e.msg.includes('crash failed'))).toBe(true);
  });

  test('existing correlation id header is reused', async () => {
    const { logger, entries } = makeLogger();
    const middleware = new RequestLoggerMiddleware(logger as any);

    const response = await middleware.use(
      new Request('http://localhost/api', { headers: { 'x-request-id': 'corr-123' } }),
      async () => new Response('ok'),
    );

    expect(response.headers.get('x-request-id')).toBe('corr-123');
  });
});
