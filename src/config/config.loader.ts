/** biome-ignore-all lint/suspicious/noExplicitAny: <ignore> */
import fs from "node:fs";
import path from "node:path";
import { AppError } from "../errors/app-error.js";
import { warn } from "../logging/console-logger.js";
import { DEFAULT_CONFIG, type VeapConfig } from "./contracts.js";

let cachedConfig: VeapConfig | null = null;

/**
 * Loads the Veap configuration from veap.config.ts or veap.config in the current working directory.
 * SERVER ONLY.
 */
export async function getVeapConfig(): Promise<VeapConfig> {
  // Prevent this from ever running on the client even if imported
  if (typeof window !== "undefined") {
    warn("veap:config", "getVeapConfig can only be called on the server.");
    throw AppError.Internal("getVeapConfig can only be called on the server.");
  }

  // Use memory cache in production
  if (process.env.NODE_ENV === "production" && cachedConfig) {
    return cachedConfig;
  }

  const cwd = process.cwd();
  const configPathTS = path.join(cwd, "veap.config.ts");
  const configPathMJS = path.join(cwd, "veap.config.mjs");
  const configPathJS = path.join(cwd, "veap.config.js");
  const configPathFallback = path.join(cwd, "veap.config");

  let loadedConfig: Partial<VeapConfig> = {};

  try {
    // Dynamic import jiti only on server to avoid bundling issues
    const { createJiti } = await import("jiti");
    const jiti = createJiti(cwd, {
      fsCache: false,
      moduleCache: false,
    });

    if (fs.existsSync(configPathTS)) {
      const cacheBuster = `?t=${Date.now()}`;
      const imported: any = await jiti.import(
        `file://${configPathTS}${cacheBuster}`,
        {
          default: true,
        },
      );
      loadedConfig = imported.default || imported;
    } else if (fs.existsSync(configPathMJS)) {
      const imported: any = await jiti.import(configPathMJS, { default: true });
      loadedConfig = imported.default || imported;
    } else if (fs.existsSync(configPathJS)) {
      const imported: any = await jiti.import(configPathJS, { default: true });
      loadedConfig = imported.default || imported;
    } else if (fs.existsSync(configPathFallback)) {
      const imported: any = await jiti.import(configPathFallback, {
        default: true,
      });
      loadedConfig = imported.default || imported;
    }
  } catch (error) {
    warn(
      "veap:config",
      "Could not load veap.config.ts, using defaults.",
      error,
    );
  }

  const finalConfig = { ...DEFAULT_CONFIG, ...loadedConfig };

  if (process.env.NODE_ENV === "production") {
    cachedConfig = finalConfig;
  }

  return finalConfig;
}

export function clearVeapConfigCache(): void {
  cachedConfig = null;
}
