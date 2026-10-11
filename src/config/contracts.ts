import type { Token } from "../ioc/tokens.js";

export interface IConfigService {
  get<T = any>(key: string, defaultValue?: T): T;
  getAll(): Record<string, any>;
  has(key: string): boolean;
  set(key: string, value: any): void;
}

export interface VeapConfig {
  debug?: boolean;
  [key: string]: any;
}

export const DEFAULT_CONFIG: VeapConfig = {};

export interface IVeapConfigProvider {
  get(): Promise<VeapConfig>;
}

export const CONFIG_SERVICE: Token<IConfigService> =
  Symbol.for("veap:kernel:config");

export const VEAP_CONFIG: Token<IVeapConfigProvider> = Symbol.for(
  "veap:kernel:veap-config",
);
