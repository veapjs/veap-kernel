import { Injectable } from "../ioc/decorators";
import type { ILogger } from "./logger";

const colors = [
  "\x1b[32m", // Green
  "\x1b[33m", // Yellow
  "\x1b[34m", // Blue
  "\x1b[35m", // Magenta
  "\x1b[36m", // Cyan
  "\x1b[91m", // Light Red
  "\x1b[92m", // Light Green
  "\x1b[93m", // Light Yellow
  "\x1b[94m", // Light Blue
  "\x1b[95m", // Light Magenta
  "\x1b[96m", // Light Cyan
];

const cssColors = [
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#3b82f6", // Blue
  "#8b5cf6", // Violet
  "#06b6d4", // Cyan
  "#ef4444", // Red
  "#22c55e", // Green
  "#eab308", // Yellow
  "#0ea5e9", // Sky
  "#d946ef", // Fuchsia
  "#14b8a6", // Teal
];

const reset = "\x1b[0m";

function getHashIndex(group: string) {
  let hash = 0;
  for (let i = 0; i < group.length; i++) {
    hash = group.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

const isBrowser = typeof window !== "undefined";

function isSilent() {
  return process.env.VEAP_CLI === "1" && process.env.DEBUG !== "1";
}

export function debug(group: string, message: string, ...args: any[]) {
  if (isSilent()) return;
  if (process.env.NODE_ENV === "production" && !process.env.DEBUG) return;

  const idx = getHashIndex(group);
  if (isBrowser) {
    console.debug(
      `%c[${group}]`,
      `color: ${cssColors[idx % cssColors.length]}; font-weight: bold;`,
      message,
      ...args,
    );
  } else {
    const color = colors[idx % colors.length];
    console.debug(`${color}[${group}]${reset}`, message, ...args);
  }
}

export function info(group: string, message: string, ...args: any[]) {
  if (isSilent()) return;
  const idx = getHashIndex(group);
  if (isBrowser) {
    console.info(
      `%c[${group}]`,
      `color: ${cssColors[idx % cssColors.length]}; font-weight: bold;`,
      message,
      ...args,
    );
  } else {
    const color = colors[idx % colors.length];
    console.info(`${color}[${group}]${reset}`, message, ...args);
  }
}

export function warn(group: string, message: string, ...args: any[]) {
  const idx = getHashIndex(group);
  if (isBrowser) {
    console.warn(
      `%c[${group}]`,
      `color: ${cssColors[idx % cssColors.length]}; font-weight: bold;`,
      message,
      ...args,
    );
  } else {
    const color = colors[idx % colors.length];
    console.warn(
      `${color}[${group}]${reset}`,
      `\x1b[33m${message}${reset}`,
      ...args,
    );
  }
}

export function error(group: string, message: string, ...args: any[]) {
  const idx = getHashIndex(group);

  let formattedMessage = message;
  if (
    args.length > 0 &&
    typeof args[0] === "object" &&
    args[0] !== null &&
    "isAppError" in args[0]
  ) {
    const appError = args[0] as any;
    formattedMessage = `${message} [${appError.code}]`;
  }

  if (isBrowser) {
    console.error(
      `%c[${group}]`,
      `color: ${cssColors[idx % cssColors.length]}; font-weight: bold;`,
      formattedMessage,
      ...args,
    );
  } else {
    const color = colors[idx % colors.length];
    console.error(
      `${color}[${group}]${reset}`,
      `\x1b[31m${formattedMessage}${reset}`,
      ...args,
    );
  }
}

@Injectable()
export class ConsoleLogger implements ILogger {
  debug(group: string, message: string, ...args: any[]) {
    debug(group, message, ...args);
  }
  info(group: string, message: string, ...args: any[]) {
    info(group, message, ...args);
  }
  warn(group: string, message: string, ...args: any[]) {
    warn(group, message, ...args);
  }
  error(group: string, message: string, ...args: any[]) {
    error(group, message, ...args);
  }
}

export const LoggerService = ConsoleLogger;

const globalForLogger = globalThis as unknown as {
  __VEAP_LOGGER__: ConsoleLogger | undefined;
};

export const logger = globalForLogger.__VEAP_LOGGER__ ?? new ConsoleLogger();

globalForLogger.__VEAP_LOGGER__ = logger;
