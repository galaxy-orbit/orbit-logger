import type { LogEntry, LogFormatter, LogLevel } from '../interfaces/logger.interface';

const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: '\x1b[90m',
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  fatal: '\x1b[35m',
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

export class PrettyFormatter implements LogFormatter {
  private colorize: boolean;

  constructor(colorize = true) {
    this.colorize = colorize;
  }

  format(entry: LogEntry): string {
    const { level, message, timestamp, context, correlationId, data, error, duration } = entry;
    
    const parts: string[] = [];
    
    const time = new Date(timestamp).toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    parts.push(this.dim(`[${time}]`));
    
    const levelStr = level.toUpperCase().padEnd(5);
    parts.push(this.levelColor(level, levelStr));
    
    if (context) {
      parts.push(this.yellow(`[${context}]`));
    }
    
    if (correlationId) {
      parts.push(this.dim(`(${correlationId.slice(0, 8)})`));
    }
    
    parts.push(message);
    
    if (duration !== undefined) {
      parts.push(this.dim(`+${duration}ms`));
    }
    
    let output = parts.join(' ');
    
    if (data && Object.keys(data).length > 0) {
      output += '\n' + this.dim('  Data: ') + JSON.stringify(data, null, 2).split('\n').join('\n  ');
    }
    
    if (error) {
      output += '\n' + this.red(`  Error: ${error.name}: ${error.message}`);
      if (error.stack) {
        const stackLines = error.stack.split('\n').slice(1, 4);
        output += '\n' + this.dim(stackLines.map(l => '  ' + l.trim()).join('\n'));
      }
    }
    
    return output;
  }

  private levelColor(level: LogLevel, text: string): string {
    if (!this.colorize) return text;
    return `${LEVEL_COLORS[level]}${BOLD}${text}${RESET}`;
  }

  private dim(text: string): string {
    if (!this.colorize) return text;
    return `${DIM}${text}${RESET}`;
  }

  private yellow(text: string): string {
    if (!this.colorize) return text;
    return `\x1b[33m${text}${RESET}`;
  }

  private red(text: string): string {
    if (!this.colorize) return text;
    return `\x1b[31m${text}${RESET}`;
  }
}
