import { Module, DynamicModule } from '@galaxy-stack/orbit-core';
import { LoggerService } from './logger.service';
import type { LoggerModuleOptions, LoggerModuleAsyncOptions } from './interfaces/logger.interface';
import { LOGGER_OPTIONS } from './interfaces/logger.interface';

@Module({
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {
  static forRoot(options: LoggerModuleOptions = {}): DynamicModule {
    return {
      module: LoggerModule,
      global: options.global ?? true,
      providers: [
        {
          provide: LOGGER_OPTIONS,
          useValue: options,
        },
        LoggerService,
      ],
      exports: [LoggerService, LOGGER_OPTIONS],
    };
  }

  static forRootAsync(options: LoggerModuleAsyncOptions): DynamicModule {
    return {
      module: LoggerModule,
      global: options.global ?? true,
      providers: [
        {
          provide: LOGGER_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        LoggerService,
      ],
      exports: [LoggerService, LOGGER_OPTIONS],
    };
  }

  static forFeature(context: string): DynamicModule {
    return {
      module: LoggerModule,
      providers: [
        {
          provide: `LOGGER_${context}`,
          useFactory: (logger: LoggerService) => logger.child(context),
          inject: [LoggerService],
        },
      ],
      exports: [`LOGGER_${context}`],
    };
  }
}
