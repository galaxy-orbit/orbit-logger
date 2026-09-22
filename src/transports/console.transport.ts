import type { LogEntry, LogTransport, LogLevel } from '../interfaces/logger.interface';

export class ConsoleTransport implements LogTransport {
  log(entry: LogEntry, formattedMessage: string): void {
    const method = this.getConsoleMethod(entry.level);
    console[method](formattedMessage);
  }

  private getConsoleMethod(level: LogLevel): 'log' | 'warn' | 'error' | 'debug' | 'trace' {
    switch (level) {
      case 'trace':
        return 'trace';
      case 'debug':
        return 'debug';
      case 'warn':
        return 'warn';
      case 'error':
      case 'fatal':
        return 'error';
      default:
        return 'log';
    }
  }
}
