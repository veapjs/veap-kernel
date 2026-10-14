import fs from "node:fs";

let cached: string | undefined;

/**
 * Version reported by `veap --version`.
 *
 * Read from the published package manifest next to `dist/` so the CLI never
 * needs to be rebuilt to report a bumped version.
 */
export function kernelVersion(): string {
  if (cached !== undefined) return cached;

  try {
    const manifest = JSON.parse(
      fs.readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
    ) as { version?: string };
    cached = manifest.version ?? "0.0.0";
  } catch {
    cached = "0.0.0";
  }

  return cached;
}
