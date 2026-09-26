import { Injectable, Inject, Optional } from '@galaxy-stack/orbit-core';
import type { 
  LogLevel, 
  LogEntry, 
  LogFormatter, 
  LogTransport, 
  LoggerOptions 
} from './interfaces/logger.interface';
import { LOG_LEVELS, LOGGER_OPTIONS } from './interfaces/logger.interface';
import { JsonFormatter } from './formatters/json.formatter';
import { PrettyFormatter } from './formatters/pretty.formatter';
import { ConsoleTransport } from './transports/console.transport';
import { LogBuffer, getGlobalLogBuffer } from './log-buffer';

@Injectable()
export class LoggerService {
  private level: LogLevel;
  private context?: string;
  private formatter: LogFormatter;
  private transports: LogTransport[];
  private correlationId?: string;
  private timestampFormat: 'iso' | 'unix' | 'locale';
  private buffer?: LogBuffer;

  constructor(
    @Optional() @Inject(LOGGER_OPTIONS) options?: LoggerOptions
  ) {
    const opts = options || {};
    this.level = opts.level || 'info';
    this.context = opts.context;
    this.timestampFormat = opts.timestampFormat || 'iso';
    this.buffer = opts.buffer === false ? undefined : (opts.buffer instanceof LogBuffer ? opts.buffer : getGlobalLogBuffer());
    
    if (opts.formatter) {
      this.formatter = opts.formatter;
    } else if (opts.prettyPrint !== false) {
      this.formatter = new PrettyFormatter(opts.colorize !== false);
    } else {
      this.formatter = new JsonFormatter();
    }
    
    this.transports = opts.transports || [new ConsoleTransport()];
  }

  setContext(context: string): this {
    this.context = context;
    return this;
  }

  setCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  child(context: string, correlationId?: string): LoggerService {
    const child = new LoggerService({
      level: this.level,
      context,
      formatter: this.formatter,
      transports: this.transports,
      timestampFormat: this.timestampFormat,
      buffer: this.buffer,
    });
    
    if (correlationId || this.correlationId) {
      child.setCorrelationId(correlationId || this.correlationId!);
    }
    
    return child;
  }

  trace(message: string, data?: Record<string, any>): void {
    this.log('trace', message, data);
  }

  debug(message: string, data?: Record<string, any>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, any>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, any>): void {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error | Record<string, any>, data?: Record<string, any>): void {
    if (error instanceof Error) {
      this.log('error', message, data, error);
    } else {
      this.log('error', message, error);
    }
  }

  fatal(message: string, error?: Error | Record<string, any>, data?: Record<string, any>): void {
    if (error instanceof Error) {
      this.log('fatal', message, data, error);
    } else {
      this.log('fatal', message, error);
    }
  }

  log(level: LogLevel, message: string, data?: Record<string, any>, error?: Error): void {
    if (!this.isLevelEnabled(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: this.getTimestamp(),
      context: this.context,
      correlationId: this.correlationId,
      data,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    if (this.buffer) {
      this.buffer.push(entry);
    }

    const formattedMessage = this.formatter.format(entry);

    for (const transport of this.transports) {
      transport.log(entry, formattedMessage);
    }
  }

  private isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private getTimestamp(): string {
    const now = new Date();
    
    switch (this.timestampFormat) {
      case 'unix':
        return now.getTime().toString();
      case 'locale':
        return now.toLocaleString();
      case 'iso':
      default:
        return now.toISOString();
    }
  }

  startTimer(): () => number {
    const start = performance.now();
    return () => Math.round(performance.now() - start);
  }

  time<T>(label: string, fn: () => T): T;
  time<T>(label: string, fn: () => Promise<T>): Promise<T>;
  time<T>(label: string, fn: () => T | Promise<T>): T | Promise<T> {
    const stop = this.startTimer();
    
    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            this.debug(label, { duration: stop() });
            return value;
          },
          (error) => {
            this.error(label, error, { duration: stop() });
            throw error;
          }
        );
      }
      
      this.debug(label, { duration: stop() });
      return result;
    } catch (error) {
      this.error(label, error as Error, { duration: stop() });
      throw error;
    }
  }
}
