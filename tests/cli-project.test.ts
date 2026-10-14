import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  describeEntrySearch,
  findCompositionRoot,
  findConsoleEntry,
  findProjectRoot,
} from "../src/cli/project";

/**
 * Project discovery.
 *
 * The console is run from anywhere inside a project, so the root has to be
 * found deterministically: a console entry wins over a config, which wins over
 * a composition root, which wins over a lockfile, which wins over a bare
 * package.json — nearest directory first.
 */

let root: string;

function write(relative: string, content = ""): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf-8");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "veap-project-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("findProjectRoot", () => {
  it("finds the nearest directory with a package.json", () => {
    write("package.json", "{}");
    fs.mkdirSync(path.join(root, "lib", "nested"), { recursive: true });

    expect(findProjectRoot(root)).toBe(root);
    expect(findProjectRoot(path.join(root, "lib", "nested"))).toBe(root);
  });

  it("stops at the nearest project, not the outermost one", () => {
    write("package.json", "{}");
    write("bun.lock", "");
    write("apps/child/package.json", "{}");

    expect(findProjectRoot(path.join(root, "apps", "child"))).toBe(
      path.join(root, "apps", "child"),
    );
  });

  it("treats a directory with a console entry, config or composition root as a project", () => {
    const cases = [
      { file: "veap.console.ts", content: "export const providers = [];" },
      { file: "veap.config.ts", content: "export default {};" },
      { file: path.join("lib", "veap.ts"), content: "export const app = {};" },
    ];

    for (const { file, content } of cases) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veap-project-case-"));
      const target = path.join(dir, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf-8");

      expect(findProjectRoot(dir)).toBe(dir);

      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not report a project for a directory tree without manifests", () => {
    const empty = path.join(root, "empty");
    fs.mkdirSync(empty, { recursive: true });

    const found = findProjectRoot(empty);

    expect(found === undefined || !found.startsWith(root)).toBe(true);
  });
});

describe("entry discovery", () => {
  it("prefers the console entry and falls back to the composition root", () => {
    write("lib/veap.ts", "export const app = {};");
    expect(findConsoleEntry(root)).toBeUndefined();
    expect(findCompositionRoot(root)).toBe(path.join(root, "lib/veap.ts"));

    write("veap.console.ts", "export const providers = [];");
    expect(findConsoleEntry(root)).toBe(path.join(root, "veap.console.ts"));
    expect(findCompositionRoot(root)).toBe(path.join(root, "lib/veap.ts"));
  });

  it("describes every file it looked for", () => {
    const message = describeEntrySearch(root);

    expect(message).toContain("No console entry found");
    expect(message).toContain(path.join(root, "veap.console.ts"));
    expect(message).toContain(path.join(root, "lib/veap.ts"));
    expect(message).toContain("--cwd");
  });
});
