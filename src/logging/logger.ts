import type { Token } from "../ioc/tokens";

/**
 * Logging port.
 */
export interface ILogger {
  debug(group: string, message: string, ...args: any[]): void;
  info(group: string, message: string, ...args: any[]): void;
  warn(group: string, message: string, ...args: any[]): void;
  error(group: string, message: string, ...args: any[]): void;
}

/**
 * Injection token for the logging port.
 */
export const LOGGER: Token<ILogger> = Symbol.for("veap:kernel:logger");
