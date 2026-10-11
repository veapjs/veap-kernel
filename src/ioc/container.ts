import "reflect-metadata";
import { AppError } from "../errors/app-error";
import type { Token } from "./tokens";

export type { Token };

export interface ProviderDef<T = any> {
  token: Token<T>;
  useClass?: new (...args: any[]) => T;
  useValue?: T;
  useFactory?: (...args: any[]) => T | Promise<T>;
  inject?: Token<any>[];
  singleton?: boolean;
}

export class Container {
  private providers = new Map<Token<any>, ProviderDef<any>>();
  private instances = new Map<Token<any>, any>();
  private inFlight = new Map<Token<any>, Promise<any>>();

  private getTokenKey(token: Token<any>): any {
    if (typeof token === "function") {
      if (process.env.NODE_ENV !== "production") {
        return Symbol.for(`veap:ioc:${token.name}`);
      }
      return token;
    }
    return token;
  }

  /**
   * Register a provider definition in the container.
   */
  register<T>(def: ProviderDef<T>): void {
    this.providers.set(this.getTokenKey(def.token), def);
  }

  /**
   * Check if a token is registered.
   */
  has(token: Token<any>): boolean {
    return (
      this.providers.has(this.getTokenKey(token)) ||
      this.instances.has(this.getTokenKey(token))
    );
  }

  /**
   * Resolve an instance for the given token.
   */
  async resolve<T>(token: Token<T>): Promise<T> {
    const key = this.getTokenKey(token);
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    const resolutionPromise = (async () => {
      try {
        const def = this.providers.get(key);
        if (!def) {
          if (typeof token === "function") {
            return await this.instantiateClass(
              token as new (
                ...args: any[]
              ) => T,
            );
          }
          throw AppError.Internal(
            `[IoC] No provider found for token: ${token.toString()}`,
          );
        }

        let instance: any;

        if (def.useValue !== undefined) {
          instance = def.useValue;
        } else if (def.useFactory !== undefined) {
          const dependencies = await this.resolveDependencies(def.inject || []);
          instance = await def.useFactory(...dependencies);
        } else if (def.useClass !== undefined) {
          let tokens: Token<any>[] = def.inject || [];
          if (!def.inject) {
            const paramTypes =
              Reflect.getMetadata("design:paramtypes", def.useClass) || [];
            const customTokens: Map<number, Token<any>> = Reflect.getMetadata(
              "ioc:inject_params",
              def.useClass,
            ) || new Map();
            tokens = paramTypes.map(
              (type: any, index: number) => customTokens.get(index) || type,
            );
          }
          const dependencies = await this.resolveDependencies(tokens);
          instance = new def.useClass(...dependencies);
        } else {
          throw AppError.Internal(
            `[IoC] Invalid provider definition for token: ${token.toString()}`,
          );
        }

        if (def.singleton !== false) {
          this.instances.set(key, instance);
        }

        return instance;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, resolutionPromise);
    return resolutionPromise;
  }

  private async resolveDependencies(tokens: Token<any>[]): Promise<any[]> {
    return Promise.all(tokens.map((token) => this.resolve(token)));
  }

  private async instantiateClass<T>(
    TargetClass: new (...args: any[]) => T,
  ): Promise<T> {
    if ((TargetClass as unknown) === Object) {
      throw AppError.Internal(
        "[IoC] A constructor dependency resolved to the `Object` token. " +
          "This happens when an @Injectable class injects another class " +
          "imported only via `import type` (its value is erased from " +
          "design:paramtypes metadata). Use a value import for injected classes.",
      );
    }
    const paramTypes =
      Reflect.getMetadata("design:paramtypes", TargetClass) || [];
    const customTokens: Map<number, Token<any>> = Reflect.getMetadata(
      "ioc:inject_params",
      TargetClass,
    ) || new Map();

    const dependencies = await Promise.all(
      paramTypes.map((type: any, index: number) => {
        const customToken = customTokens.get(index);
        return this.resolve(customToken || type);
      }),
    );

    const instance = new TargetClass(...dependencies);

    this.instances.set(this.getTokenKey(TargetClass), instance);

    return instance;
  }

  async make<T>(token: Token<T>): Promise<T> {
    return this.resolve<T>(token);
  }

  clear(): void {
    this.instances.clear();
    this.inFlight.clear();
  }
}

const globalForContainer = globalThis as unknown as {
  __VEAP_CONTAINER__: Container | undefined;
};

export const container =
  globalForContainer.__VEAP_CONTAINER__ || new Container();

globalForContainer.__VEAP_CONTAINER__ = container;

export function app(): Container;
export function app<T>(token: Token<T>): Promise<T>;
export function app<T>(token?: Token<T>): Container | Promise<T> {
  if (token) {
    return container.resolve<T>(token);
  }
  return container;
}
