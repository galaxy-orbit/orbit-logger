import type { LogEntry, LogTransport } from '../interfaces/logger.interface';
import { appendFile, stat, rename, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface FileTransportOptions {
  filename: string;
  maxSize?: number;
  maxFiles?: number;
}

export class FileTransport implements LogTransport {
  private filename: string;
  private maxSize: number;
  private maxFiles: number;
  private buffer: string[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private currentSize: number = 0;
  private isRotating: boolean = false;

  constructor(options: FileTransportOptions) {
    this.filename = options.filename;
    this.maxSize = options.maxSize || 10 * 1024 * 1024;
    this.maxFiles = options.maxFiles || 5;
    
    const dir = dirname(this.filename);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    this.initCurrentSize();
    
    this.flushInterval = setInterval(() => this.flush(), 1000);
  }

  private async initCurrentSize(): Promise<void> {
    try {
      const stats = await stat(this.filename);
      this.currentSize = stats.size;
    } catch {
      this.currentSize = 0;
    }
  }

  async log(entry: LogEntry, formattedMessage: string): Promise<void> {
    const line = formattedMessage + '\n';
    this.buffer.push(line);
    
    if (this.buffer.length >= 100) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.isRotating) return;
    
    const content = this.buffer.join('');
    const contentSize = Buffer.byteLength(content, 'utf8');
    this.buffer = [];
    
    try {
      if (this.currentSize + contentSize > this.maxSize) {
        await this.rotate();
      }
      
      await appendFile(this.filename, content, 'utf8');
      this.currentSize += contentSize;
    } catch (error) {
      console.error('FileTransport: Failed to write to file', error);
    }
  }

  private async rotate(): Promise<void> {
    if (this.isRotating) return;
    this.isRotating = true;
    
    try {
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const oldFile = `${this.filename}.${i}`;
        const newFile = `${this.filename}.${i + 1}`;
        
        try {
          await stat(oldFile);
          if (i === this.maxFiles - 1) {
            await writeFile(newFile, '');
          }
          await rename(oldFile, newFile);
        } catch {
        }
      }
      
      try {
        await stat(this.filename);
        await rename(this.filename, `${this.filename}.1`);
      } catch {
      }
      
      await writeFile(this.filename, '');
      this.currentSize = 0;
    } catch (error) {
      console.error('FileTransport: Failed to rotate file', error);
    } finally {
      this.isRotating = false;
    }
  }

  close(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}
