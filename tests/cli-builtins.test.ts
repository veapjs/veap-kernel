import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConsoleApplication } from "../src/cli/console-application";
import { generateCommand } from "../src/cli/generator";
import { BufferedOutput } from "../src/cli/output";
import { commands } from "../src/cli/registry";
import { Application } from "../src/composition/application";
import { AppError } from "../src/errors/app-error";
import { container } from "../src/ioc/container";

/**
 * Kernel built-in commands: `about`, `config:show` and `make:command`.
 *
 * Covered behaviours: the summary table, single-key and full config output,
 * exit code for a missing key, command scaffolding into the project root,
 * `--dir`, overwrite protection and name validation.
 */

function run(
  root: string,
  argv: string[],
): { code: Promise<number>; output: BufferedOutput } {
  const output = new BufferedOutput();
  const application = Application.configure().withProviders([]).create();

  return {
    output,
    code: new ConsoleApplication({
      root,
      argv,
      output,
      application,
      chdir: false,
    }).run(),
  };
}

let root: string;
let originalCwd: string;

beforeEach(() => {
  const globals = globalThis as Record<string, unknown>;
  delete globals.__VEAP_BOOTSTRAPPED__;
  delete globals.__VEAP_BOOTSTRAPPING_PROMISE__;
  globals.__VEAP_ACTIVE_PROVIDERS__ = [];
  container.reset();
  commands.clear();

  process.env.ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZg==";
  process.env.VEAP_BUILTIN_TEST = "from-env";
  originalCwd = process.cwd();

  root = fs.mkdtempSync(path.join(os.tmpdir(), "veap-builtins-"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "builtins-fixture" }),
    "utf-8",
  );
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.VEAP_CLI;
  delete process.env.DEBUG;
  delete process.env.VEAP_BUILTIN_TEST;
});

describe("about", () => {
  it("summarizes the kernel, environment and project", async () => {
    const run1 = run(root, ["about"]);

    await expect(run1.code).resolves.toBe(0);
    const text = run1.output.text();
    expect(text).toMatch(/Veap \d+\.\d+\.\d+/);
    expect(text).toMatch(/Environment\s+\S+/);
    expect(text).toContain("Project root");
    expect(text).toContain(root);
    // The five built-ins are registered before the application is loaded.
    expect(text).toMatch(/Available commands\s+5/);
  });

  it("is listed as a built-in command", async () => {
    const run1 = run(root, ["list"]);

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.text()).toContain("about");
    expect(run1.output.text()).toContain("config:show");
    expect(run1.output.text()).toContain("make:command");
  });
});

describe("config:show", () => {
  it("lists the resolved configuration", async () => {
    const run1 = run(root, ["config:show"]);

    await expect(run1.code).resolves.toBe(0);
    const text = run1.output.text();
    expect(text).toContain("Key");
    expect(text).toContain("VEAP_BUILTIN_TEST");
    expect(text).toContain("from-env");
  });

  it("prints a single key as KEY=value", async () => {
    const run1 = run(root, ["config:show", "VEAP_BUILTIN_TEST"]);

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.text().trim()).toBe("VEAP_BUILTIN_TEST=from-env");
  });

  it("fails for an unknown key", async () => {
    const run1 = run(root, ["config:show", "VEAP_DOES_NOT_EXIST"]);

    await expect(run1.code).resolves.toBe(1);
    expect(run1.output.find("error")).toEqual([
      'Configuration key "VEAP_DOES_NOT_EXIST" is not defined.',
    ]);
  });
});

describe("make:command", () => {
  it("scaffolds a command class in the project's commands directory", async () => {
    const run1 = run(root, ["make:command", "reports:generate"]);

    await expect(run1.code).resolves.toBe(0);

    const file = path.join(root, "commands", "reports-generate.ts");
    expect(fs.existsSync(file)).toBe(true);

    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("export class GenerateCommand extends Command");
    expect(content).toContain('static signature = "reports:generate"');
    expect(content).toContain('from "@veap/kernel/cli"');
    expect(run1.output.find("success")).toEqual([
      "Created command: commands/reports-generate.ts",
    ]);
    expect(run1.output.find("info").join("\n")).toContain("GenerateCommand");
  });

  it("derives a PascalCase class name from a kebab-case name", async () => {
    const run1 = run(root, ["make:command", "send-emails"]);

    await expect(run1.code).resolves.toBe(0);
    const content = fs.readFileSync(
      path.join(root, "commands", "send-emails.ts"),
      "utf-8",
    );
    expect(content).toContain("export class SendEmailsCommand extends Command");
    expect(content).toContain('static signature = "send-emails"');
  });

  it("writes into the directory given by --dir", async () => {
    const run1 = run(root, ["make:command", "cleanup", "--dir=tools"]);

    await expect(run1.code).resolves.toBe(0);
    expect(fs.existsSync(path.join(root, "tools", "cleanup.ts"))).toBe(true);
  });

  it("refuses to overwrite an existing command", async () => {
    const first = run(root, ["make:command", "cleanup"]);
    await expect(first.code).resolves.toBe(0);

    const second = run(root, ["make:command", "cleanup"]);
    await expect(second.code).resolves.toBe(1);
    expect(second.output.find("error").join("\n")).toContain("already exists");
  });

  it("rejects a name that is not a valid command name", async () => {
    const run1 = run(root, ["make:command", "bad!name"]);

    await expect(run1.code).resolves.toBe(1);
    expect(run1.output.find("error").join("\n")).toContain(
      "may only contain letters",
    );
  });
});

describe("generateCommand", () => {
  it("returns the class name, signature and absolute path", async () => {
    const generated = await generateCommand(
      "reports:generate",
      path.join(root, "commands"),
    );

    expect(generated.className).toBe("GenerateCommand");
    expect(generated.signature).toBe("reports:generate");
    expect(generated.filePath).toBe(
      path.join(root, "commands", "reports-generate.ts"),
    );
  });

  it("keeps digits and underscores in the class name", async () => {
    const generated = await generateCommand(
      "v2_purge",
      path.join(root, "commands"),
    );

    expect(generated.className).toBe("V2PurgeCommand");
  });

  it("rejects an empty name and a name with invalid characters", async () => {
    await expect(
      generateCommand("", path.join(root, "commands")),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      generateCommand("bad name", path.join(root, "commands")),
    ).rejects.toThrow(/may only contain letters/);
    await expect(
      generateCommand("  ", path.join(root, "commands")),
    ).rejects.toThrow(/A command name is required/);
  });
});
