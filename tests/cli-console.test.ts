import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandInput } from "../src/cli/command";
import { Command } from "../src/cli/command";
import { ConsoleApplication } from "../src/cli/console-application";
import type { Output } from "../src/cli/output";
import { BufferedOutput } from "../src/cli/output";
import { commands } from "../src/cli/registry";
import {
  Application,
  type ProviderEntry,
} from "../src/composition/application";
import { AppError } from "../src/errors/app-error";
import { container } from "../src/ioc/container";
import { ServiceProvider } from "../src/ioc/service-provider";

/**
 * The console end to end.
 *
 * Covered behaviours: bootstrapping an application, harvesting the commands its
 * providers declare, running one command, exit codes, error reporting, `list`
 * and `help`, `--version`, `--quiet`, `.env` loading, `chdir`, project entry
 * resolution (including a real TypeScript entry loaded through jiti) and the
 * guaranteed `shutdown()` on the way out.
 */

class GreetCommand extends Command {
  static signature = "greet {name} {--l|loud}";
  static description = "Greet someone";

  handle(input: CommandInput, output: Output): number {
    const name = input.argument("name") ?? "";
    output.success(
      input.flag("loud") ? `HELLO ${name.toUpperCase()}` : `Hello ${name}`,
    );
    return 0;
  }
}

class FailCommand extends Command {
  static signature = "fail";
  static description = "Fail with a custom exit code";

  handle(): number {
    return 3;
  }
}

class ThrowCommand extends Command {
  static signature = "throw {--app-error}";
  static description = "Throw an error";

  handle(input: CommandInput): void {
    if (input.flag("app-error")) {
      throw AppError.BadRequest("Nope, denied.");
    }
    throw new Error("Boom");
  }
}

class GuardCommand extends Command {
  static signature = "guard";
  static description = "Report the global flags and confirm a destructive step";

  async handle(_input: CommandInput, output: Output): Promise<number> {
    output.writeln(`force=${this.context.flags.force}`);

    const proceed = await output.confirm("Proceed with the destructive step?", {
      default: false,
    });
    output.writeln(proceed ? "proceeded" : "skipped");

    return 0;
  }
}

class AskCommand extends Command {
  static signature = "ask";
  static description = "Ask a question that has no default answer";

  async handle(_input: CommandInput, output: Output): Promise<void> {
    const name = await output.ask("Name?");
    output.writeln(name);
  }
}

class EnvCommand extends Command {
  static signature = "env {key}";
  static description = "Print an environment variable";

  handle(input: CommandInput, output: Output): void {
    const key = input.argument("key") ?? "";
    output.writeln(process.env[key] ?? "MISSING");
  }
}

class CwdCommand extends Command {
  static signature = "cwd";
  static description = "Print the working directory";

  handle(_input: CommandInput, output: Output): void {
    output.writeln(process.cwd());
  }
}

class MigrateCommand extends Command {
  static signature = "migrate";
  static description = "Run the migrations";

  handle(): void {}
}

class MigrateRollbackCommand extends Command {
  static signature = "migrate:rollback";
  static description = "Roll back the last batch";

  handle(): void {}
}

class FixtureProvider extends ServiceProvider {
  static shutdowns = 0;

  register(): void {}

  commands() {
    return [
      GreetCommand,
      FailCommand,
      ThrowCommand,
      GuardCommand,
      AskCommand,
      EnvCommand,
      CwdCommand,
      MigrateCommand,
      MigrateRollbackCommand,
    ];
  }

  async shutdown(): Promise<void> {
    FixtureProvider.shutdowns += 1;
  }
}

function buildApplication(
  providers: ProviderEntry[] = [FixtureProvider],
): Application {
  return Application.configure().withProviders(providers).create();
}

interface RunOptions {
  application?: Application;
  output?: BufferedOutput;
  chdir?: boolean;
  loadModule?: (file: string) => Promise<Record<string, unknown>>;
}

function run(
  root: string,
  argv: string[],
  options: RunOptions = {},
): { code: Promise<number>; output: BufferedOutput } {
  const output = options.output ?? new BufferedOutput();

  return {
    output,
    code: new ConsoleApplication({
      root,
      argv,
      output,
      application: options.application,
      loadModule: options.loadModule,
      chdir: options.chdir ?? false,
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
  originalCwd = process.cwd();
  FixtureProvider.shutdowns = 0;

  root = fs.mkdtempSync(path.join(os.tmpdir(), "veap-console-"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "console-fixture" }),
    "utf-8",
  );
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.VEAP_CLI;
  delete process.env.DEBUG;
  delete process.env.VEAP_FIXTURE_FLAG;
});

describe("ConsoleApplication", () => {
  it("lists the built-in commands and the commands declared by providers", async () => {
    const run1 = run(root, ["list"], { application: buildApplication() });

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.text()).toContain("Veap console");
    expect(run1.output.text()).toContain("Available commands:");
    expect(run1.output.text()).toContain("greet");
    expect(run1.output.text()).toContain("Greet someone");
    expect(run1.output.text()).toContain("help");
  });

  it("defaults to list when no command is given", async () => {
    const run1 = run(root, [], { application: buildApplication() });

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.text()).toContain("Available commands:");
  });

  it("runs a command with arguments and options", async () => {
    const run1 = run(root, ["greet", "World", "--loud"], {
      application: buildApplication(),
    });

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.find("success")).toEqual(["HELLO WORLD"]);
  });

  it("resolves the short alias of an option", async () => {
    const run1 = run(root, ["greet", "World", "-l"], {
      application: buildApplication(),
    });

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.text()).toContain("HELLO WORLD");
  });

  it("returns the exit code of the command", async () => {
    const run1 = run(root, ["fail"], { application: buildApplication() });

    await expect(run1.code).resolves.toBe(3);
  });

  it("reports a missing required argument with the usage line", async () => {
    const run1 = run(root, ["greet"], { application: buildApplication() });

    await expect(run1.code).resolves.toBe(1);
    expect(run1.output.find("error")).toEqual([
      'The "name" argument is required.',
    ]);
    expect(run1.output.find("info").join("\n")).toContain(
      "Usage: veap greet <name> [--loud]",
    );
  });

  it("suggests the closest command for an unknown name", async () => {
    const run1 = run(root, ["great"], { application: buildApplication() });

    await expect(run1.code).resolves.toBe(1);
    expect(run1.output.find("error")).toEqual([
      'Command "great" is not defined.',
    ]);
    expect(run1.output.find("info").join("\n")).toContain(
      "Did you mean: greet?",
    );
  });

  it("lists the candidates of an ambiguous command prefix", async () => {
    const run1 = run(root, ["mig"], { application: buildApplication() });

    await expect(run1.code).resolves.toBe(1);
    expect(run1.output.find("error")).toEqual(['Command "mig" is ambiguous.']);
    expect(run1.output.find("info").join("\n")).toContain("migrate:rollback");
  });

  it("resolves a unique command prefix", async () => {
    const run1 = run(root, ["gre", "World"], {
      application: buildApplication(),
    });

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.text()).toContain("Hello World");
  });

  it("renders help for a command through `help` and through --help", async () => {
    const viaHelp = run(root, ["help", "greet"], {
      application: buildApplication(),
    });
    await expect(viaHelp.code).resolves.toBe(0);

    const viaFlag = run(root, ["greet", "--help"], {
      application: buildApplication(),
    });
    await expect(viaFlag.code).resolves.toBe(0);

    for (const output of [viaHelp.output, viaFlag.output]) {
      expect(output.text()).toContain("Usage:");
      expect(output.text()).toContain("veap greet <name> [--loud]");
      expect(output.text()).toContain("Arguments:");
      expect(output.text()).toContain("Options:");
      expect(output.text()).toContain("--loud");
    }
  });

  it("prints the version without booting anything", async () => {
    const run1 = run(root, ["--version"]);

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.text().trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("harvests provider commands and always shuts the application down", async () => {
    const application = buildApplication();
    const run1 = run(root, ["greet", "World"], { application });

    await expect(run1.code).resolves.toBe(0);
    expect(commands.has("greet")).toBe(true);
    expect(FixtureProvider.shutdowns).toBe(1);
  });

  it("loads the project .env and marks the process as a CLI run", async () => {
    fs.writeFileSync(
      path.join(root, ".env"),
      "VEAP_FIXTURE_FLAG=from-env\n",
      "utf-8",
    );

    const run1 = run(root, ["env", "VEAP_FIXTURE_FLAG"], {
      application: buildApplication(),
    });

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.text()).toContain("from-env");
    expect(process.env.VEAP_CLI).toBe("1");
  });

  it("runs the command from the project root", async () => {
    fs.mkdirSync(path.join(root, "nested"), { recursive: true });

    const run1 = run(root, ["cwd"], {
      application: buildApplication(),
      chdir: true,
    });

    await expect(run1.code).resolves.toBe(0);
    expect(fs.realpathSync(run1.output.text().trim())).toBe(
      fs.realpathSync(root),
    );
  });

  it("silences informational output with --quiet", async () => {
    const run1 = run(root, ["--quiet", "list"], {
      application: buildApplication(),
    });

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.lines).toEqual([]);
  });

  it("reports thrown errors and only prints a stack when verbose", async () => {
    const quiet = run(root, ["throw"], { application: buildApplication() });
    await expect(quiet.code).resolves.toBe(1);
    expect(quiet.output.find("error")).toEqual(["Boom"]);
    expect(quiet.output.text()).not.toContain("at ");

    const verbose = run(root, ["-v", "throw", "--app-error"], {
      application: buildApplication(),
    });
    await expect(verbose.code).resolves.toBe(1);
    expect(verbose.output.find("error")).toEqual(["Nope, denied."]);
    expect(verbose.output.text()).toContain("at ");
  });

  it("fails with an actionable message when the project has no console entry", async () => {
    const run1 = run(root, ["list"]);

    await expect(run1.code).resolves.toBe(1);
    expect(run1.output.find("error").join("\n")).toContain(
      "No console entry found",
    );
    expect(run1.output.find("error").join("\n")).toContain("veap.console.ts");
  });

  it("loads a TypeScript console entry through jiti", async () => {
    fs.writeFileSync(
      path.join(root, "veap.console.ts"),
      "export const providers = [];\n",
      "utf-8",
    );

    const run1 = run(root, ["list"]);

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.text()).toContain("Available commands:");
  });

  it("resolves the tsconfig path aliases declared by the project", async () => {
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } },
      }),
      "utf-8",
    );
    fs.mkdirSync(path.join(root, "lib"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "lib", "providers.ts"),
      "export const providers: any[] = [];\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(root, "veap.console.ts"),
      'import { providers } from "@/lib/providers";\nexport { providers };\n',
      "utf-8",
    );

    const run1 = run(root, ["list"]);

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.text()).toContain("Available commands:");
  });

  it("loads project modules that contain JSX", async () => {
    fs.mkdirSync(path.join(root, "components"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "components", "site-layout.tsx"),
      [
        'import type { ReactNode } from "react";',
        "export function SiteLayout({ children }: { children: ReactNode }) {",
        '  return <div className="bg-background">{children}</div>;',
        "}",
        "",
      ].join("\n"),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(root, "veap.console.ts"),
      [
        'import { SiteLayout } from "./components/site-layout";',
        "export const providers: any[] = [];",
        "export const layout = SiteLayout;",
        "",
      ].join("\n"),
      "utf-8",
    );

    const run1 = run(root, ["list"]);

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.text()).toContain("Available commands:");
  });

  it("rejects a console entry that exports nothing usable", async () => {
    fs.writeFileSync(
      path.join(root, "veap.console.ts"),
      "export const nope = true;\n",
      "utf-8",
    );

    const run1 = run(root, ["list"], {
      loadModule: async () => ({ nope: true }),
    });

    await expect(run1.code).resolves.toBe(1);
    expect(run1.output.find("error").join("\n")).toContain(
      "must export an Application",
    );
  });

  it("accepts an application returned by the entry module", async () => {
    fs.writeFileSync(
      path.join(root, "veap.console.ts"),
      "export const application = {};\n",
      "utf-8",
    );

    const application = buildApplication();
    const run1 = run(root, ["greet", "World"], {
      loadModule: async () => ({ application }),
    });

    await expect(run1.code).resolves.toBe(0);
    expect(run1.output.text()).toContain("Hello World");
  });

  it("fails on a missing --cwd directory", async () => {
    const run1 = run(root, ["--cwd", path.join(root, "nope"), "list"], {
      application: buildApplication(),
    });

    await expect(run1.code).resolves.toBe(1);
    expect(run1.output.find("error").join("\n")).toContain(
      "The --cwd directory does not exist",
    );
  });

  describe("global flags", () => {
    it("reports --force to the command context", async () => {
      const without = new BufferedOutput();
      without.queueAnswer("y");
      const off = run(root, ["guard"], {
        application: buildApplication(),
        output: without,
      });
      await expect(off.code).resolves.toBe(0);
      expect(without.text()).toContain("force=false");

      const forced = new BufferedOutput();
      forced.queueAnswer("y");
      const on = run(root, ["guard", "--force"], {
        application: buildApplication(),
        output: forced,
      });
      await expect(on.code).resolves.toBe(0);
      expect(forced.text()).toContain("force=true");
    });

    it("answers a prompt with its default under --no-interaction", async () => {
      const output = new BufferedOutput();
      // Queued on purpose: the run must not consult it.
      output.queueAnswer("y");

      const run1 = run(root, ["--no-interaction", "guard"], {
        application: buildApplication(),
        output,
      });

      await expect(run1.code).resolves.toBe(0);
      expect(output.text()).toContain("skipped");
      expect(output.text()).not.toContain("proceeded");
    });

    it("accepts -n as the short form of --no-interaction", async () => {
      const output = new BufferedOutput();
      output.queueAnswer("y");

      const run1 = run(root, ["-n", "guard"], {
        application: buildApplication(),
        output,
      });

      await expect(run1.code).resolves.toBe(0);
      expect(output.text()).toContain("skipped");
    });

    it("fails a question without a default under --no-interaction", async () => {
      const output = new BufferedOutput();

      const run1 = run(root, ["-n", "ask"], {
        application: buildApplication(),
        output,
      });

      await expect(run1.code).resolves.toBe(1);
      expect(output.find("error").join("\n")).toContain("--no-interaction");
    });

    it("still prompts when the flag is absent", async () => {
      const output = new BufferedOutput();
      output.queueAnswer("y");

      const run1 = run(root, ["guard"], {
        application: buildApplication(),
        output,
      });

      await expect(run1.code).resolves.toBe(0);
      expect(output.text()).toContain("proceeded");
    });

    it("keeps the global flags out of the command's own arguments", async () => {
      const run1 = run(root, ["greet", "World", "--force"], {
        application: buildApplication(),
      });

      await expect(run1.code).resolves.toBe(0);
      expect(run1.output.find("success")).toEqual(["Hello World"]);
    });
  });
});
