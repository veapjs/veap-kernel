import type { Token } from "../ioc/tokens";

export interface ICacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export const CACHE_PROVIDER: Token<ICacheProvider> =
  Symbol.for("veap:kernel:cache");
