import fs from "node:fs";
import path from "node:path";

/**
 * Minimal `.env` loader for the console.
 *
 * Next.js loads `.env` files for the web application, but nothing does it for a
 * Node process started from `bin/veap`, so the console has to load them itself.
 * The grammar is deliberately small and documented instead of pulling `dotenv`
 * into the framework:
 *
 * - `KEY=value`, one per line, optional `export ` prefix
 * - `#` comments (whole-line, and inline when preceded by whitespace)
 * - single-quoted values are literal, double-quoted values unescape
 *   `\n`, `\r`, `\t`, `\\` and `\"`
 * - no interpolation, no shell expansion, no multi-line values
 *
 * Values already present in `process.env` always win, so the shell and the CI
 * environment keep the last word.
 */

export interface LoadedEnv {
  /** Absolute paths of the files that were read, most specific first. */
  files: string[];
  /** Variables that were actually applied to `process.env`. */
  variables: Record<string, string>;
}

export interface LoadEnvOptions {
  root: string;
  /** Environment name used for `.env.<env>` lookup. */
  env?: string;
  /** Overwrite variables that already exist in `process.env`. */
  override?: boolean;
  /** Explicit file list, bypassing the `.env` convention. */
  files?: string[];
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function unescapeDoubleQuoted(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseValue(raw: string): string {
  const value = raw.trim();

  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return unescapeDoubleQuoted(value.slice(1, -1));
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  const comment = value.search(/\s#/);
  return (comment >= 0 ? value.slice(0, comment) : value).trim();
}

/** Parses the contents of a `.env` file into a plain object. */
export function parseEnvFile(content: string): Record<string, string> {
  const variables: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;

    const equals = withoutExport.indexOf("=");
    if (equals <= 0) continue;

    const key = withoutExport.slice(0, equals).trim();
    if (!KEY_PATTERN.test(key)) continue;

    variables[key] = parseValue(withoutExport.slice(equals + 1));
  }

  return variables;
}

/**
 * `.env` files in precedence order (most specific first), following the
 * convention Next.js and Vite use. `.env.local` is skipped in the `test`
 * environment so tests never pick up a developer's local overrides.
 */
export function envFileNames(env = "development"): string[] {
  if (env === "test") return [".env.test.local", ".env.test", ".env"];

  return [`.env.${env}.local`, ".env.local", `.env.${env}`, ".env"];
}

/**
 * Reads the project's `.env` files and applies the values to `process.env`.
 * Missing files are skipped silently — a project does not need all four.
 */
export function loadEnv(options: LoadEnvOptions): LoadedEnv {
  const env = options.env ?? "development";
  const names = options.files ?? envFileNames(env);
  const files: string[] = [];
  const variables: Record<string, string> = {};

  for (const name of names) {
    const file = path.isAbsolute(name) ? name : path.join(options.root, name);
    if (!fs.existsSync(file)) continue;

    files.push(file);

    const parsed = parseEnvFile(fs.readFileSync(file, "utf-8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (!options.override && process.env[key] !== undefined) continue;
      if (key in variables && !options.override) continue;

      variables[key] = value;
      process.env[key] = value;
    }
  }

  return { files, variables };
}
