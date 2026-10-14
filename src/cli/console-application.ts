import fs from "node:fs";
import path from "node:path";
import { Application, type ProviderEntry } from "../composition/application.js";
import { AppError } from "../errors/app-error.js";
import { COOKIE_STORE, REQUEST_CONTEXT } from "../http/contracts.js";
import {
  MemoryCookieStore,
  MemoryRequestContext,
} from "../http/memory-http.js";
import type { Container } from "../ioc/container.js";
import { container as globalContainer } from "../ioc/container.js";
import {
  COMMAND_CONTEXT,
  type Command,
  type CommandContext,
  type CommandEntry,
  type CommandFlags,
  CommandInput,
} from "./command.js";
import { createBuiltinCommands } from "./commands/builtins.js";
import { loadEnv } from "./env.js";
import { renderCommandHelp, renderCommandList } from "./help.js";
import { ConsoleOutput, NonInteractiveOutput, type Output } from "./output.js";
import {
  describeEntrySearch,
  findCompositionRoot,
  findConsoleEntry,
  findProjectRoot,
} from "./project.js";
import {
  type CommandRegistry,
  commands as globalCommands,
} from "./registry.js";
import { formatUsage, matchArgs } from "./signature.js";
import { kernelVersion } from "./version.js";

/**
 * The `veap` console — the Veap equivalent of Laravel's Artisan.
 *
 * One console run is one process: it resolves the project, loads the
 * environment, boots the application so every provider can register its
 * commands, runs exactly one command and always shuts the application down
 * again (so database pools are closed and the process can exit).
 */

export interface GlobalFlags extends CommandFlags {
  cwd?: string;
  env?: string;
  verbose: boolean;
  quiet: boolean;
  ansi?: boolean;
  help: boolean;
  version: boolean;
  /** `--no-interaction`/`-n` was passed; `undefined` leaves prompting alone. */
  interactive?: boolean;
}

export interface ParsedArgv {
  flags: GlobalFlags;
  /** argv with the global flags removed, starting with the command name. */
  rest: string[];
  errors: string[];
}

export interface ConsoleApplicationOptions {
  /** Project root; discovered by walking up from `process.cwd()` when omitted. */
  root?: string;
  /** Environment name used for `.env.<env>` lookup and `NODE_ENV`. */
  env?: string;
  /** argv without the binary; defaults to `process.argv.slice(2)`. */
  argv?: string[];
  /** Output port; defaults to a TTY-aware `ConsoleOutput`. */
  output?: Output;
  /** Pre-built application, bypassing entry-file resolution (tests, embedding). */
  application?: Application;
  /** Overrides how project modules are imported (jiti by default). */
  loadModule?: (file: string) => Promise<Record<string, unknown>>;
  /** `false` keeps the current working directory untouched. */
  chdir?: boolean;
  /** `false` skips `application.shutdown()` on the way out. */
  shutdown?: boolean;
}

/**
 * Splits argv into console globals and the command invocation.
 *
 * `-v`/`-h`/`-q`/`-n` are reserved by the console, exactly as in Artisan; `--`
 * terminates option parsing. Globals are recognised anywhere in argv, so
 * `veap migrate:rollback --force` works the way it reads.
 */
export function parseGlobalFlags(argv: string[]): ParsedArgv {
  const flags: GlobalFlags = {
    verbose: false,
    quiet: false,
    help: false,
    version: false,
    force: false,
  };
  const rest: string[] = [];
  const errors: string[] = [];

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === undefined) continue;

    if (token === "--") {
      rest.push(...argv.slice(index));
      break;
    }

    const equals = token.startsWith("--") ? token.indexOf("=") : -1;
    const key = equals > 0 ? token.slice(0, equals) : token;
    const inlineValue = equals > 0 ? token.slice(equals + 1) : undefined;

    const readValue = (): string => {
      const value = inlineValue ?? argv[++index];
      if (value === undefined || value === "") {
        errors.push(`The "${key}" option requires a value.`);
        return "";
      }
      return value;
    };

    switch (key) {
      case "--cwd":
        flags.cwd = readValue();
        break;
      case "--env":
      case "-e":
        flags.env = readValue();
        break;
      case "--verbose":
      case "-v":
        flags.verbose = true;
        break;
      case "--quiet":
      case "-q":
        flags.quiet = true;
        break;
      case "--ansi":
        flags.ansi = true;
        break;
      case "--no-ansi":
        flags.ansi = false;
        break;
      case "--force":
        flags.force = true;
        break;
      case "--no-interaction":
      case "-n":
        flags.interactive = false;
        break;
      case "--help":
      case "-h":
        flags.help = true;
        break;
      case "--version":
      case "-V":
        flags.version = true;
        break;
      default:
        rest.push(token);
        break;
    }
  }

  return { flags, rest, errors };
}

/** Drops non-essential output when `--quiet` is set. */
class QuietOutput implements Output {
  constructor(private readonly inner: Output) {}

  writeln(): void {}
  info(): void {}
  success(): void {}

  warn(message: string): void {
    this.inner.warn(message);
  }

  error(message: string): void {
    this.inner.error(message);
  }

  table(): void {}

  ask(question: string, options?: { default?: string }): Promise<string> {
    return this.inner.ask(question, options);
  }

  confirm(question: string, options?: { default?: boolean }): Promise<boolean> {
    return this.inner.confirm(question, options);
  }
}

/** Duck-typed check so a jiti-loaded module can hand us its own Application. */
export function isApplication(value: unknown): value is Application {
  const candidate = value as Partial<Application> | undefined;
  return (
    typeof candidate?.bootstrap === "function" &&
    typeof candidate?.shutdown === "function"
  );
}

function extractProviders(
  module: Record<string, unknown>,
): ProviderEntry[] | undefined {
  const providers = module.providers;
  return Array.isArray(providers) ? (providers as ProviderEntry[]) : undefined;
}

async function extractApplication(
  module: Record<string, unknown>,
): Promise<Application | undefined> {
  for (const key of ["application", "app", "default"]) {
    const value = module[key];
    if (isApplication(value)) return value;
  }
  for (const key of ["createApplication", "create", "default"]) {
    const factory = module[key];
    if (typeof factory !== "function") continue;
    const created = await (factory as () => unknown)();
    if (isApplication(created)) return created;
  }

  return undefined;
}

export class ConsoleApplication {
  private readonly argv: string[];
  private readonly baseOutput: Output;
  private readonly root?: string;
  private readonly environment?: string;
  private readonly providedApplication?: Application;
  private readonly loadModule?: (
    file: string,
  ) => Promise<Record<string, unknown>>;
  private readonly chdir: boolean;
  private readonly shutdown: boolean;
  private readonly registry: CommandRegistry;

  constructor(options: ConsoleApplicationOptions = {}) {
    this.argv = options.argv ?? process.argv.slice(2);
    this.baseOutput = options.output ?? new ConsoleOutput();
    this.root = options.root;
    this.environment = options.env;
    this.providedApplication = options.application;
    this.loadModule = options.loadModule;
    this.chdir = options.chdir ?? true;
    this.shutdown = options.shutdown ?? true;
    this.registry = globalCommands;
  }

  /** Runs the command named in argv and returns the process exit code. */
  async run(): Promise<number> {
    const parsed = parseGlobalFlags(this.argv);
    const output = this.baseOutput;
    // `--no-interaction` promises that nothing in this run can block on input,
    // so every prompt either takes its default or fails with a clear message.
    const interactive =
      parsed.flags.interactive === false
        ? new NonInteractiveOutput(output)
        : output;
    const active: Output = parsed.flags.quiet
      ? new QuietOutput(interactive)
      : interactive;

    for (const error of parsed.errors) output.error(error);
    if (parsed.errors.length > 0) return 1;

    if (parsed.flags.version) {
      output.writeln(kernelVersion());
      return 0;
    }

    let root: string;
    try {
      root = this.resolveRoot(parsed.flags.cwd);
    } catch (error) {
      return this.reportError(error, output, parsed.flags.verbose);
    }

    const env =
      this.environment ??
      parsed.flags.env ??
      process.env.NODE_ENV ??
      "development";
    // `--env <name>` selects both the `.env.<name>` file and the environment the
    // framework sees, exactly like `artisan --env`. Assigned through
    // Object.assign because the Node typings declare NODE_ENV as read-only.
    if (parsed.flags.env) {
      Object.assign(process.env, { NODE_ENV: parsed.flags.env });
    }
    process.env.VEAP_CLI = "1";
    if (parsed.flags.verbose) process.env.DEBUG = "1";

    loadEnv({ root, env });
    if (this.chdir) process.chdir(root);

    this.registry.register(createBuiltinCommands());
    this.registerTransportFallbacks(globalContainer);

    let application: Application | undefined;
    const onSigint = (): void => {
      output.warn("Interrupted.");
      void this.teardown(application).finally(() => process.exit(130));
    };
    if (this.shutdown) process.once("SIGINT", onSigint);

    try {
      application = await this.loadApplication(root);
      await application.bootstrap();

      return await this.execute(parsed, root, env, application, active);
    } catch (error) {
      return this.reportError(error, output, parsed.flags.verbose);
    } finally {
      process.removeListener("SIGINT", onSigint);
      await this.teardown(application);
    }
  }

  private resolveRoot(cwd?: string): string {
    if (cwd) {
      const resolved = path.resolve(cwd);
      if (!fs.existsSync(resolved)) {
        throw AppError.BadRequest(
          `The --cwd directory does not exist: ${resolved}`,
        );
      }
      return resolved;
    }
    if (this.root) return path.resolve(this.root);

    const discovered = findProjectRoot(process.cwd());
    if (!discovered) {
      throw AppError.BadRequest(
        `Could not locate a project root above ${process.cwd()}. Run the command with --cwd <project>.`,
      );
    }

    return discovered;
  }

  private registerTransportFallbacks(container: Container): void {
    // Registered before bootstrap so `KernelServiceProvider` skips the Next.js
    // adapters: a command has no request scope, and `next/headers` would throw.
    if (!container.has(COOKIE_STORE)) {
      container.register({
        token: COOKIE_STORE,
        useClass: MemoryCookieStore,
        singleton: true,
      });
    }
    if (!container.has(REQUEST_CONTEXT)) {
      container.register({
        token: REQUEST_CONTEXT,
        useClass: MemoryRequestContext,
        singleton: true,
      });
    }
  }

  private async loadApplication(root: string): Promise<Application> {
    if (this.providedApplication) return this.providedApplication;

    const entry = findConsoleEntry(root);
    if (entry) {
      const module = await this.importModule(entry);
      const application = await extractApplication(module);
      if (application) return application;

      // An empty `providers` array is a valid declaration: an application that
      // relies purely on the kernel's own services.
      const providers = extractProviders(module);
      if (providers) {
        return Application.configure().withProviders(providers).create();
      }

      throw AppError.Internal(
        `The console entry ${entry} must export an Application ("application"), a factory ("createApplication") or a "providers" array.`,
      );
    }

    const compositionRoot = findCompositionRoot(root);
    if (compositionRoot) {
      const module = await this.importModule(compositionRoot);
      const application = await extractApplication(module);
      if (application) return application;

      throw AppError.Internal(
        `The composition root ${compositionRoot} does not export an Application. Export it as "app" or "application".`,
      );
    }

    throw AppError.Internal(describeEntrySearch(root));
  }

  private async importModule(file: string): Promise<Record<string, unknown>> {
    if (this.loadModule) return this.loadModule(file);

    const { createJiti } = await import("jiti");
    const jiti = createJiti(path.dirname(file), {
      fsCache: false,
      moduleCache: false,
      // A composition root may import React components (a site layout passed to
      // the plugins provider, for example), and jiti only parses JSX when it is
      // explicitly enabled.
      jsx: true,
      // Scaffolded projects use the `@/*` alias from their tsconfig; without
      // this, importing the composition root fails on the first aliased import.
      tsconfigPaths: true,
    });

    // Without `{ default: true }` jiti returns the module namespace, which is
    // what entry resolution needs: named exports of the project's module.
    const loaded = await jiti.import<Record<string, unknown>>(file);
    return loaded ?? {};
  }

  private async execute(
    parsed: ParsedArgv,
    root: string,
    env: string,
    application: Application,
    output: Output,
  ): Promise<number> {
    const rest = parsed.rest.length > 0 ? parsed.rest : ["list"];
    const [name, ...commandArgs] = rest;

    if (name === undefined) {
      output.error("No command specified.");
      output.info('Run "veap list" to see the available commands.');
      return 1;
    }
    if (name.startsWith("-")) {
      output.error(`No command specified: "${name}" is an option.`);
      output.info('Run "veap list" to see the available commands.');
      return 1;
    }

    const resolution = this.registry.resolve(name);
    if (resolution.ambiguous) {
      output.error(`Command "${name}" is ambiguous.`);
      output.info(`Did you mean one of: ${resolution.candidates.join(", ")}?`);
      return 1;
    }
    if (!resolution.descriptor) {
      output.error(`Command "${name}" is not defined.`);
      if (resolution.candidates.length > 0) {
        output.info(`Did you mean: ${resolution.candidates.join(", ")}?`);
      }
      output.info('Run "veap list" to see the available commands.');
      return 1;
    }

    const descriptor = resolution.descriptor;

    if (parsed.flags.help || commandArgs.includes("--help")) {
      renderCommandHelp(descriptor, output);
      return 0;
    }

    const signature = descriptor.signature;
    const matched = matchArgs(signature, commandArgs);
    if (matched.errors.length > 0) {
      for (const error of matched.errors) output.error(error);
      output.info(`Usage: ${formatUsage(signature)}`);
      return 1;
    }

    const context: CommandContext = {
      root,
      env,
      application,
      container: globalContainer,
      registry: this.registry,
      flags: { force: parsed.flags.force },
    };
    globalContainer.register({
      token: COMMAND_CONTEXT,
      useValue: context,
      singleton: true,
    });

    const command = await this.instantiate(descriptor.entry, context);
    const result = await command.handle(
      new CommandInput(signature, matched, commandArgs),
      output,
    );

    return typeof result === "number" ? result : 0;
  }

  private async instantiate(
    entry: CommandEntry,
    context: CommandContext,
  ): Promise<Command> {
    if (typeof entry !== "function") return entry;

    // A command explicitly registered in the container is resolved through it,
    // so constructor injection keeps working; every other command is built with
    // the console context, which needs no decorators in application code.
    if (globalContainer.has(entry)) {
      return (await globalContainer.resolve(entry)) as Command;
    }

    return new entry(context);
  }

  private async teardown(application?: Application): Promise<void> {
    if (!application || !this.shutdown) return;

    try {
      await application.shutdown();
    } catch (error) {
      this.baseOutput.warn(
        `Shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private reportError(
    error: unknown,
    output: Output,
    verbose: boolean,
  ): number {
    if (error instanceof AppError) {
      output.error(error.message);
      if (verbose && error.stack) output.writeln(error.stack);
      return 1;
    }
    if (error instanceof Error) {
      output.error(error.message);
      if (verbose && error.stack) output.writeln(error.stack);
      return 1;
    }

    output.error(String(error));
    return 1;
  }
}

/** Convenience entry point used by `bin/veap`. */
export async function runConsole(
  argv: string[] = process.argv.slice(2),
  options: Omit<ConsoleApplicationOptions, "argv"> = {},
): Promise<number> {
  return new ConsoleApplication({ ...options, argv }).run();
}
