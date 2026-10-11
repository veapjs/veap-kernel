import "reflect-metadata";
import type { Token } from "./tokens";

export function Injectable(): ClassDecorator {
  return (_target: any) => {};
}

export function Inject(token: Token<any>): ParameterDecorator {
  return (
    target: any,
    _propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ) => {
    const customTokens: Map<number, Token<any>> = Reflect.getMetadata(
      "ioc:inject_params",
      target,
    ) || new Map();
    customTokens.set(parameterIndex, token);
    Reflect.defineMetadata("ioc:inject_params", customTokens, target);
  };
}
