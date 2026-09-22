import type { LogEntry, LogFormatter } from '../interfaces/logger.interface';

export class JsonFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    return JSON.stringify(entry);
  }
}
