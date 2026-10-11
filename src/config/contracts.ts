import type { Token } from "../ioc/tokens";

export interface IConfigService {
  get<T = any>(key: string, defaultValue?: T): T;
  getAll(): Record<string, any>;
  has(key: string): boolean;
  set(key: string, value: any): void;
}

export interface VeapConfig {
  /**
   * Prefix for all administrative routes.
   * Default: "/app"
   */
  privatePath?: string;

  intl?: {
    /**
     * The name of the cookie that stores the user's locale.
     * Default: "VEAP_LOCALE"
     */
    cookie?: string;
    /**
     * The default locale to use if none is provided.
     * Default: "en"
     */
    default?: string;
    /**
     * A list of all available locales.
     * Default: ["en", "de", "fr", "es", "it", "ja", "ko", "pt", "ru", "zh"]
     */
    locales?: string[];
    /**
     * The default timezone to use for date and relative time formatting.
     * Default: "UTC"
     */
    timeZone?: string;
  };
  debug?: boolean;
  [key: string]: any;
}

export const DEFAULT_CONFIG: VeapConfig = {
  privatePath: "/app",
};

export interface IVeapConfigProvider {
  get(): Promise<VeapConfig>;
}

export const CONFIG_SERVICE: Token<IConfigService> =
  Symbol.for("veap:kernel:config");

export const VEAP_CONFIG: Token<IVeapConfigProvider> = Symbol.for(
  "veap:kernel:veap-config",
);
