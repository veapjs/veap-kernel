import fs from "node:fs";
import path from "node:path";

/**
 * Project discovery for the console.
 *
 * The console has to answer two questions before it can bootstrap anything:
 * where is the project root (config, `.env`, relative SQLite paths all resolve
 * against it), and which module describes the application's providers.
 */

/** Console entry candidates, in resolution order. */
export const CONSOLE_ENTRY_FILES = [
  "veap.console.ts",
  "veap.console.mts",
  "veap.console.cts",
  "veap.console.js",
  "veap.console.mjs",
  "veap.console.cjs",
];

/** Config candidates that also mark a directory as a Veap project. */
export const CONFIG_ENTRY_FILES = [
  "veap.config.ts",
  "veap.config.mts",
  "veap.config.js",
  "veap.config.mjs",
  "veap.config.cjs",
  "veap.config",
];

/** Conventional composition root of a scaffolded application. */
export const COMPOSITION_ROOT_FILES = [
  "lib/veap.ts",
  "lib/veap.mts",
  "lib/veap.mjs",
  "lib/veap.js",
  "lib/veap.tsx",
  "lib/veap/index.ts",
];

export const LOCKFILES = [
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
];

function existing(root: string, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const file = path.join(root, candidate);
    if (fs.existsSync(file)) return file;
  }
  return undefined;
}

function isProjectDirectory(dir: string): boolean {
  if (existing(dir, CONSOLE_ENTRY_FILES)) return true;
  if (existing(dir, CONFIG_ENTRY_FILES)) return true;
  if (existing(dir, COMPOSITION_ROOT_FILES)) return true;
  if (
    fs.existsSync(path.join(dir, "package.json")) &&
    existing(dir, LOCKFILES)
  ) {
    return true;
  }
  return fs.existsSync(path.join(dir, "package.json"));
}

/**
 * Walks up from `startDir` to the nearest directory that looks like a project:
 * a console entry, a Veap config, a composition root, a lockfile or — as the
 * last resort — a bare `package.json`.
 */
export function findProjectRoot(startDir: string): string | undefined {
  let dir = path.resolve(startDir);

  for (;;) {
    if (isProjectDirectory(dir)) return dir;

    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Absolute path of the project's console entry, when it declares one. */
export function findConsoleEntry(root: string): string | undefined {
  return existing(root, CONSOLE_ENTRY_FILES);
}

/** Absolute path of the project's composition root, when it uses one. */
export function findCompositionRoot(root: string): string | undefined {
  return existing(root, COMPOSITION_ROOT_FILES);
}

/** Relative paths the console searched, for actionable error messages. */
export function describeEntrySearch(root: string): string {
  const relative = [...CONSOLE_ENTRY_FILES, ...COMPOSITION_ROOT_FILES].map(
    (file) => `  - ${path.join(root, file)}`,
  );

  return [
    `No console entry found in ${root}.`,
    "The console bootstraps the application through one of these files:",
    ...relative,
    "",
    "Create veap.console.ts in the project root (or run the command with --cwd <project>).",
  ].join("\n");
}
