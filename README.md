# @galaxy-stack/orbit-logger

[![npm version](https://img.shields.io/npm/v/@galaxy-stack/orbit-logger.svg)](https://www.npmjs.com/package/@galaxy-stack/orbit-logger)
[![docs](https://img.shields.io/badge/docs-galaxy--orbit--framework.vercel.app-blue)](https://galaxy-orbit-framework.vercel.app)

Part of the [Orbit framework](https://github.com/galaxy-orbit/packages) — a NestJS-style backend framework for [Bun](https://bun.sh).

## Installation

```bash
bun add @galaxy-stack/orbit-logger
```

# @galaxy-stack/orbit-logger

## Mô tả
Structured logging module cho Orbit framework với hỗ trợ JSON logging, request correlation, và multiple transports.

## Cài đặt

```bash
bun add @galaxy-stack/orbit-logger
```

## Tính năng

- Structured JSON logging
- Log levels: trace, debug, info, warn, error, fatal
- Request correlation IDs (X-Request-ID)
- Context tracking và child loggers
- Multiple formatters (JSON, Pretty)
- Multiple transports (Console, File, Custom)
- RequestLoggerMiddleware cho HTTP logging
- @Log() decorator cho automatic method logging
- Timer utilities

## Sử dụng cơ bản

### LoggerModule

```typescript
import { Module } from '@galaxy-stack/orbit-core';
import { LoggerModule } from '@galaxy-stack/orbit-logger';

@Module({
  imports: [
    LoggerModule.forRoot({
      level: 'info',
      prettyPrint: true,
      colorize: true,
    }),
  ],
})
class AppModule {}
```

### Async Configuration

```typescript
import { ConfigService } from '@galaxy-stack/orbit-config';

LoggerModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    level: config.get('LOG_LEVEL', 'info'),
    prettyPrint: config.get('NODE_ENV') !== 'production',
  }),
  inject: [ConfigService],
})
```

### LoggerService

```typescript
import { Injectable } from '@galaxy-stack/orbit-core';
import { LoggerService } from '@galaxy-stack/orbit-logger';

@Injectable()
class UserService {
  constructor(private logger: LoggerService) {
    this.logger.setContext('UserService');
  }

  createUser(data: CreateUserDto) {
    this.logger.info('Creating user', { email: data.email });
    
    try {
      const user = await this.userRepo.create(data);
      this.logger.info('User created', { userId: user.id });
      return user;
    } catch (error) {
      this.logger.error('Failed to create user', error, { email: data.email });
      throw error;
    }
  }
}
```

### Child Loggers

```typescript
const requestLogger = logger.child('Request', correlationId);
requestLogger.info('Processing request');
```

### Log Levels

```typescript
logger.trace('Trace message');    // Level 0
logger.debug('Debug message');    // Level 1
logger.info('Info message');      // Level 2
logger.warn('Warning message');   // Level 3
logger.error('Error message');    // Level 4
logger.fatal('Fatal message');    // Level 5
```

### Timer Utility

```typescript
const result = await logger.time('Database query', async () => {
  return await db.query('SELECT * FROM users');
});
```

## Request Logger Middleware

```typescript
import { createRequestLoggerMiddleware, LoggerService } from '@galaxy-stack/orbit-logger';

const logger = new LoggerService({ level: 'info' });

const middleware = createRequestLoggerMiddleware(logger, {
  level: 'info',
  correlationIdHeader: 'x-request-id',
  excludePaths: ['/health', '/metrics'],
  redactHeaders: ['authorization', 'cookie'],
});
```

Output:
```
[10:30:45] INFO  [HTTP] [Request] (a1b2c3d4) GET /api/users
[10:30:45] INFO  [HTTP] [Request] (a1b2c3d4) GET /api/users 200 +15ms
```

## @Log() Decorator

```typescript
import { Log, LoggerService } from '@galaxy-stack/orbit-logger';

@Injectable()
class PaymentService {
  constructor(private logger: LoggerService) {}

  @Log({ level: 'info', logArgs: true, logDuration: true })
  async processPayment(amount: number, currency: string) {
    // Method logic
    return { success: true };
  }
}
```

## Formatters

### JSON Formatter (Production)
```typescript
import { JsonFormatter, LoggerModule } from '@galaxy-stack/orbit-logger';

LoggerModule.forRoot({
  formatter: new JsonFormatter(),
})
```

Output:
```json
{"level":"info","message":"User created","timestamp":"2024-01-01T10:30:45.123Z","context":"UserService","data":{"userId":123}}
```

### Pretty Formatter (Development)
```typescript
import { PrettyFormatter, LoggerModule } from '@galaxy-stack/orbit-logger';

LoggerModule.forRoot({
  formatter: new PrettyFormatter(true), // colorize = true
})
```

Output:
```
[10:30:45] INFO  [UserService] User created
  Data: {"userId": 123}
```

## Transports

### Console Transport (Default)
```typescript
import { ConsoleTransport } from '@galaxy-stack/orbit-logger';

LoggerModule.forRoot({
  transports: [new ConsoleTransport()],
})
```

### File Transport
```typescript
import { FileTransport, ConsoleTransport } from '@galaxy-stack/orbit-logger';

LoggerModule.forRoot({
  transports: [
    new ConsoleTransport(),
    new FileTransport({
      filename: 'logs/app.log',
      maxSize: 10 * 1024 * 1024, // 10MB
    }),
  ],
})
```

### Custom Transport
```typescript
import { LogTransport, LogEntry } from '@galaxy-stack/orbit-logger';

class CustomTransport implements LogTransport {
  async log(entry: LogEntry, formattedMessage: string) {
    await fetch('https://logging-service.example.com/logs', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  }
}

LoggerModule.forRoot({
  transports: [new ConsoleTransport(), new CustomTransport()],
})
```

## Feature Module

```typescript
import { LoggerModule } from '@galaxy-stack/orbit-logger';

@Module({
  imports: [
    LoggerModule.forFeature('PaymentService'),
  ],
})
class PaymentModule {}
```

## Options

### LoggerModuleOptions

| Option | Type | Default | Mô tả |
|--------|------|---------|-------|
| level | LogLevel | 'info' | Minimum log level |
| context | string | - | Default context |
| formatter | LogFormatter | PrettyFormatter | Log formatter |
| transports | LogTransport[] | [ConsoleTransport] | Log transports |
| prettyPrint | boolean | true | Use pretty formatter |
| colorize | boolean | true | Enable colors |
| timestampFormat | 'iso' \| 'unix' \| 'locale' | 'iso' | Timestamp format |
| global | boolean | true | Register globally |

### RequestLoggerOptions

| Option | Type | Default | Mô tả |
|--------|------|---------|-------|
| level | LogLevel | 'info' | Log level for requests |
| skip | Function | - | Skip logging function |
| correlationIdHeader | string | 'x-request-id' | Correlation ID header |
| excludePaths | string[] | ['/health', '/metrics'] | Paths to exclude |
| redactHeaders | string[] | ['authorization', 'cookie'] | Headers to redact |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    LoggerService                        │
├─────────────────────────────────────────────────────────┤
│  trace() │ debug() │ info() │ warn() │ error() │ fatal()│
├─────────────────────────────────────────────────────────┤
│                     Formatter                           │
│            (JSON / Pretty / Custom)                     │
├─────────────────────────────────────────────────────────┤
│                     Transports                          │
│         (Console / File / Custom)                       │
└─────────────────────────────────────────────────────────┘
```
