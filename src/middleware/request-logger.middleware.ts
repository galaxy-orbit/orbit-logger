import { Injectable, Optional } from '@galaxy-stack/orbit-core';
import { LoggerService } from '../logger.service';
import type { LogLevel } from '../interfaces/logger.interface';

export interface RequestLoggerOptions {
  level?: LogLevel;
  skip?: (req: Request) => boolean;
  correlationIdHeader?: string;
  logRequestBody?: boolean;
  logResponseBody?: boolean;
  excludePaths?: string[];
  redactHeaders?: string[];
  redactBodyFields?: string[];
  maxBodyLength?: number;
}

@Injectable()
export class RequestLoggerMiddleware {
  private options: Required<RequestLoggerOptions>;
  private logger: LoggerService;

  constructor(
    logger: LoggerService,
    @Optional() options?: RequestLoggerOptions
  ) {
    this.logger = logger.child('HTTP');
    this.options = {
      level: options?.level ?? 'info',
      skip: options?.skip ?? (() => false),
      correlationIdHeader: options?.correlationIdHeader ?? 'x-request-id',
      logRequestBody: options?.logRequestBody ?? false,
      logResponseBody: options?.logResponseBody ?? false,
      excludePaths: options?.excludePaths ?? ['/health', '/metrics', '/favicon.ico'],
      redactHeaders: options?.redactHeaders ?? ['authorization', 'cookie', 'x-api-key'],
      redactBodyFields: options?.redactBodyFields ?? ['password', 'token', 'secret', 'apiKey', 'creditCard'],
      maxBodyLength: options?.maxBodyLength ?? 10000,
    };
  }

  async use(
    req: Request, 
    next: () => Promise<Response>
  ): Promise<Response> {
    const url = new URL(req.url);
    
    if (this.shouldSkip(req, url)) {
      return next();
    }

    const correlationId = this.getOrCreateCorrelationId(req);
    const requestLogger = this.logger.child('Request', correlationId);
    const startTime = performance.now();

    const method = req.method;
    const path = url.pathname;
    const query = url.search || undefined;

    const requestData: Record<string, any> = {
      method,
      path,
      query,
      headers: this.sanitizeHeaders(req.headers),
      userAgent: req.headers.get('user-agent'),
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
    };

    if (this.options.logRequestBody && this.hasBody(req)) {
      requestData.body = await this.getRequestBody(req);
    }

    requestLogger.log(this.options.level, `${method} ${path}`, requestData);

    try {
      const response = await next();
      const duration = Math.round(performance.now() - startTime);

      const statusCode = response.status;
      const level = this.getResponseLevel(statusCode);

      const responseData: Record<string, any> = {
        method,
        path,
        statusCode,
        duration,
        contentLength: response.headers.get('content-length'),
      };

      if (this.options.logResponseBody) {
        const { body, newResponse } = await this.getResponseBody(response);
        responseData.body = body;
        
        requestLogger.log(level, `${method} ${path} ${statusCode}`, responseData);

        const newHeaders = new Headers(newResponse.headers);
        newHeaders.set(this.options.correlationIdHeader, correlationId);
        
        return new Response(newResponse.body, {
          status: newResponse.status,
          statusText: newResponse.statusText,
          headers: newHeaders,
        });
      }

      requestLogger.log(level, `${method} ${path} ${statusCode}`, responseData);

      const newHeaders = new Headers(response.headers);
      newHeaders.set(this.options.correlationIdHeader, correlationId);
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      const duration = Math.round(performance.now() - startTime);

      requestLogger.error(`${method} ${path} failed`, error as Error, {
        method,
        path,
        duration,
      });

      throw error;
    }
  }

  private shouldSkip(req: Request, url: URL): boolean {
    if (this.options.skip(req)) {
      return true;
    }

    return this.options.excludePaths.some(excluded => 
      url.pathname === excluded || url.pathname.startsWith(excluded + '/')
    );
  }

  private getOrCreateCorrelationId(req: Request): string {
    const existing = req.headers.get(this.options.correlationIdHeader);
    if (existing) {
      return existing;
    }
    
    return crypto.randomUUID();
  }

  private sanitizeHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    
    headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (this.options.redactHeaders.includes(lowerKey)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = value;
      }
    });
    
    return result;
  }

  private getResponseLevel(statusCode: number): LogLevel {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return this.options.level;
  }

  private hasBody(req: Request): boolean {
    const method = req.method.toUpperCase();
    return ['POST', 'PUT', 'PATCH'].includes(method);
  }

  private async getRequestBody(req: Request): Promise<any> {
    try {
      const contentType = req.headers.get('content-type') || '';
      const clonedReq = req.clone();
      
      if (contentType.includes('application/json')) {
        const body = await clonedReq.json();
        return this.redactSensitiveFields(body);
      }
      
      if (contentType.includes('text/')) {
        const text = await clonedReq.text();
        return this.truncateBody(text);
      }
      
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await clonedReq.formData();
        const obj: Record<string, any> = {};
        formData.forEach((value, key) => {
          obj[key] = this.options.redactBodyFields.includes(key) ? '[REDACTED]' : value;
        });
        return obj;
      }
      
      return '[Binary or unsupported content type]';
    } catch {
      return '[Failed to parse body]';
    }
  }

  private async getResponseBody(response: Response): Promise<{ body: any; newResponse: Response }> {
    try {
      const contentType = response.headers.get('content-type') || '';
      const clonedResponse = response.clone();
      
      if (contentType.includes('application/json')) {
        const body = await clonedResponse.json();
        return {
          body: this.redactSensitiveFields(body),
          newResponse: response,
        };
      }
      
      if (contentType.includes('text/')) {
        const text = await clonedResponse.text();
        return {
          body: this.truncateBody(text),
          newResponse: new Response(text, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          }),
        };
      }
      
      return {
        body: '[Binary or unsupported content type]',
        newResponse: response,
      };
    } catch {
      return {
        body: '[Failed to parse body]',
        newResponse: response,
      };
    }
  }

  private redactSensitiveFields(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.redactSensitiveFields(item));
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (this.options.redactBodyFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.redactSensitiveFields(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private truncateBody(text: string): string {
    if (text.length > this.options.maxBodyLength) {
      return text.slice(0, this.options.maxBodyLength) + '... [truncated]';
    }
    return text;
  }
}

export function createRequestLoggerMiddleware(
  logger: LoggerService,
  options?: RequestLoggerOptions
) {
  const middleware = new RequestLoggerMiddleware(logger, options);
  return (req: Request, next: () => Promise<Response>) => middleware.use(req, next);
}
