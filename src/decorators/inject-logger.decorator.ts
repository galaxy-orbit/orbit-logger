import 'reflect-metadata';

const INJECT_LOGGER_KEY = Symbol('inject:logger');

export function InjectLogger(context?: string): ParameterDecorator {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const existingLoggerParams: Array<{ index: number; context?: string }> = 
      Reflect.getOwnMetadata(INJECT_LOGGER_KEY, target) || [];
    
    existingLoggerParams.push({ index: parameterIndex, context });
    
    Reflect.defineMetadata(INJECT_LOGGER_KEY, existingLoggerParams, target);
  };
}

export function getInjectLoggerMetadata(target: any): Array<{ index: number; context?: string }> {
  return Reflect.getOwnMetadata(INJECT_LOGGER_KEY, target) || [];
}
