import 'reflect-metadata';
import type { LogLevel } from '../interfaces/logger.interface';

const LOG_METADATA_KEY = Symbol('log:metadata');

export interface LogOptions {
  level?: LogLevel;
  message?: string;
  logArgs?: boolean;
  logResult?: boolean;
  logDuration?: boolean;
}

export function Log(options: LogOptions = {}): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const methodName = String(propertyKey);
    
    const opts: Required<LogOptions> = {
      level: options.level || 'debug',
      message: options.message || methodName,
      logArgs: options.logArgs ?? false,
      logResult: options.logResult ?? false,
      logDuration: options.logDuration ?? true,
    };

    Reflect.defineMetadata(LOG_METADATA_KEY, opts, target, propertyKey);

    descriptor.value = async function (...args: any[]) {
      const logger = (this as any).logger;
      
      if (!logger) {
        return originalMethod.apply(this, args);
      }

      const startTime = performance.now();
      const data: Record<string, any> = {};
      
      if (opts.logArgs && args.length > 0) {
        data.args = args;
      }

      logger.log(opts.level, `${opts.message} - started`, data);

      try {
        const result = await originalMethod.apply(this, args);
        const duration = Math.round(performance.now() - startTime);
        
        const resultData: Record<string, any> = {};
        if (opts.logDuration) {
          resultData.duration = duration;
        }
        if (opts.logResult && result !== undefined) {
          resultData.result = result;
        }
        
        logger.log(opts.level, `${opts.message} - completed`, resultData);
        
        return result;
      } catch (error) {
        const duration = Math.round(performance.now() - startTime);
        
        logger.error(`${opts.message} - failed`, error as Error, { duration });
        
        throw error;
      }
    };

    return descriptor;
  };
}

export function getLogMetadata(target: any, propertyKey: string | symbol): LogOptions | undefined {
  return Reflect.getMetadata(LOG_METADATA_KEY, target, propertyKey);
}
