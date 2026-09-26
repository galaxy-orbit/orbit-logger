export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  correlationId?: string;
  data?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
}

export interface LogFormatter {
  format(entry: LogEntry): string;
}

export interface LogTransport {
  log(entry: LogEntry, formattedMessage: string): void | Promise<void>;
}

export interface LoggerOptions {
  level?: LogLevel;
  context?: string;
  formatter?: LogFormatter;
  transports?: LogTransport[];
  correlationIdHeader?: string;
  timestampFormat?: 'iso' | 'unix' | 'locale';
  prettyPrint?: boolean;
  colorize?: boolean;
  /** Push entries into a LogBuffer for devtools (default: global buffer). `false` disables. */
  buffer?: boolean | import('../log-buffer').LogBuffer;
}

export interface LoggerModuleOptions extends LoggerOptions {
  global?: boolean;
}

export interface LoggerModuleAsyncOptions {
  global?: boolean;
  useFactory: (...args: any[]) => Promise<LoggerOptions> | LoggerOptions;
  inject?: any[];
}

export const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

export const LOGGER_OPTIONS = Symbol('LOGGER_OPTIONS');
