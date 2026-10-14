import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { envFileNames, loadEnv, parseEnvFile } from "../src/cli/env";

/**
 * Console environment loading.
 *
 * Next.js loads `.env` for the web application; a process started from
 * `bin/veap` has to do it itself. Covered behaviours: the documented grammar,
 * file precedence, and `process.env` always winning over a file.
 */

const touched = [
  "VEAP_TEST_PLAIN",
  "VEAP_TEST_QUOTED",
  "VEAP_TEST_MULTI",
  "VEAP_TEST_SHARED",
];

let root: string;

function write(name: string, content: string): void {
  fs.writeFileSync(path.join(root, name), content, "utf-8");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "veap-env-"));
  for (const key of touched) delete process.env[key];
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  for (const key of touched) delete process.env[key];
});

describe("parseEnvFile", () => {
  it("parses the documented grammar", () => {
    const parsed = parseEnvFile(
      [
        "# comment",
        "",
        "VEAP_TEST_PLAIN=value",
        "export VEAP_TEST_EXPORTED=exported",
        'VEAP_TEST_QUOTED="  spaced  "',
        "VEAP_TEST_SINGLE='literal \\n value'",
        "VEAP_TEST_MULTI=before # inline comment",
        "VEAP_TEST_EMPTY=",
        "not a valid line",
        "1INVALID=value",
      ].join("\n"),
    );

    expect(parsed.VEAP_TEST_PLAIN).toBe("value");
    expect(parsed.VEAP_TEST_EXPORTED).toBe("exported");
    expect(parsed.VEAP_TEST_QUOTED).toBe("  spaced  ");
    expect(parsed.VEAP_TEST_SINGLE).toBe("literal \\n value");
    expect(parsed.VEAP_TEST_MULTI).toBe("before");
    expect(parsed.VEAP_TEST_EMPTY).toBe("");
    expect(parsed["1INVALID"]).toBeUndefined();
  });

  it("unescapes double-quoted values", () => {
    expect(parseEnvFile('KEY="a\\nb\\t"').KEY).toBe("a\nb\t");
  });
});

describe("envFileNames", () => {
  it("lists files most specific first and skips .env.local in tests", () => {
    expect(envFileNames("development")).toEqual([
      ".env.development.local",
      ".env.local",
      ".env.development",
      ".env",
    ]);
    expect(envFileNames("test")).toEqual([
      ".env.test.local",
      ".env.test",
      ".env",
    ]);
  });
});

describe("loadEnv", () => {
  it("applies the most specific file first and keeps earlier files intact", () => {
    write(".env", "VEAP_TEST_PLAIN=base\nVEAP_TEST_SHARED=from-base");
    write(".env.local", "VEAP_TEST_PLAIN=local");

    const loaded = loadEnv({ root, env: "development" });

    expect(loaded.variables.VEAP_TEST_PLAIN).toBe("local");
    expect(loaded.variables.VEAP_TEST_SHARED).toBe("from-base");
    expect(process.env.VEAP_TEST_PLAIN).toBe("local");
    expect(loaded.files).toHaveLength(2);
  });

  it("skips .env.local in the test environment", () => {
    write(".env.local", "VEAP_TEST_PLAIN=local");
    write(".env.test", "VEAP_TEST_PLAIN=from-env-file");

    loadEnv({ root, env: "test" });

    expect(process.env.VEAP_TEST_PLAIN).toBe("from-env-file");

    delete process.env.VEAP_TEST_PLAIN;
    write(".env.test.local", "VEAP_TEST_PLAIN=from-env-local");

    loadEnv({ root, env: "test" });

    expect(process.env.VEAP_TEST_PLAIN).toBe("from-env-local");
  });

  it("prefers .env.local over .env.<env> outside the test environment", () => {
    write(".env.development", "VEAP_TEST_PLAIN=from-env-file");
    write(".env.local", "VEAP_TEST_PLAIN=from-local");

    loadEnv({ root, env: "development" });

    expect(process.env.VEAP_TEST_PLAIN).toBe("from-local");
  });

  it("never overrides variables that are already set", () => {
    write(".env", "VEAP_TEST_PLAIN=from-file");
    process.env.VEAP_TEST_PLAIN = "from-shell";

    const loaded = loadEnv({ root, env: "development" });

    expect(process.env.VEAP_TEST_PLAIN).toBe("from-shell");
    expect(loaded.variables.VEAP_TEST_PLAIN).toBeUndefined();
  });

  it("overrides existing variables when asked to", () => {
    write(".env", "VEAP_TEST_PLAIN=from-file");
    process.env.VEAP_TEST_PLAIN = "from-shell";

    loadEnv({ root, env: "development", override: true });

    expect(process.env.VEAP_TEST_PLAIN).toBe("from-file");
  });

  it("ignores missing files", () => {
    const loaded = loadEnv({ root, env: "development" });

    expect(loaded.files).toEqual([]);
    expect(loaded.variables).toEqual({});
  });

  it("reads an explicit file list", () => {
    write("custom.env", "VEAP_TEST_PLAIN=custom");

    const loaded = loadEnv({ root, files: ["custom.env"] });

    expect(loaded.variables.VEAP_TEST_PLAIN).toBe("custom");
  });
});
