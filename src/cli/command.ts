import type { Application } from "../composition/application.js";
import type { Container } from "../ioc/container.js";
import type { Token } from "../ioc/tokens.js";
import type { Output } from "./output.js";
import {
  type CommandSignature,
  formatUsage,
  type MatchResult,
  parseSignature,
} from "./signature.js";

/**
 * Global console flags that change how a command is allowed to behave.
 *
 * Parsed by the console before the command runs, so a command never has to look
 * at argv or at `process.env` to know whether it may skip a confirmation.
 */
export interface CommandFlags {
  /**
   * `--force` was passed: the user waived confirmations for this run.
   *
   * The way to answer a `confirm()` guard unattended — a CI job runs
   * `veap migrate:rollback --force` instead of hanging on a prompt.
   */
  force: boolean;
}

/**
 * Everything a command needs to know about the console invocation it runs in.
 * The context is available as `this.context` inside `handle()`, and is bound in
 * the container under {@link COMMAND_CONTEXT} for commands resolved through the
 * container.
 */
export interface CommandContext {
  /** Absolute path of the project root the console runs against. */
  root: string;
  /** Resolved environment name (`--env`, `NODE_ENV`, or `development`). */
  env: string;
  /** The bootstrapped application. */
  application: Application;
  /** The IoC container the application was bootstrapped with. */
  container: Container;
  /** Registry of every command available in this process. */
  registry: CommandRegistryLike;
  /** Global flags this invocation was started with. */
  flags: CommandFlags;
}

/**
 * Structural type for the command registry, kept here so this module stays free
 * of runtime imports that the console needs.
 */
export interface CommandRegistryLike {
  all(): CommandDescriptor[];
  find(name: string): CommandDescriptor | undefined;
  resolve(name: string): {
    descriptor?: CommandDescriptor;
    candidates: string[];
    ambiguous: boolean;
  };
}

export interface CommandDescriptor {
  name: string;
  description: string;
  hidden: boolean;
  signature: CommandSignature;
  entry: CommandEntry;
}

export type CommandClass = new (context: CommandContext) => Command;

/** A command is registered either as a class or as a ready instance. */
export type CommandEntry = CommandClass | Command;

export const COMMAND_CONTEXT: Token<CommandContext> = Symbol.for(
  "veap:kernel:command-context",
);

/**
 * Normalises the arguments and options of one invocation.
 *
 * Commands read values through this object instead of touching argv, so the
 * parsing rules live in one place and are covered by the signature tests.
 */
export class CommandInput {
  constructor(
    private readonly commandSignature: CommandSignature,
    private readonly matched: MatchResult,
    /** Raw tokens as passed to the command (without the command name). */
    public readonly raw: string[],
  ) {}

  signature(): CommandSignature {
    return this.commandSignature;
  }

  usage(binary = "veap"): string {
    return formatUsage(this.commandSignature, binary);
  }

  /** Parsed argument value; `undefined` when an optional argument was omitted. */
  argument(name: string): string | undefined {
    const value = this.matched.arguments[name];
    return Array.isArray(value) ? value[0] : value;
  }

  /** Every value of an argument, always as an array (variadic or scalar). */
  argumentList(name: string): string[] {
    const value = this.matched.arguments[name];
    if (Array.isArray(value)) return value;
    return value === undefined ? [] : [value];
  }

  arguments(): Record<string, string | string[]> {
    return { ...this.matched.arguments };
  }

  /** Value of an option; `true` for flags, `undefined` when it was not passed. */
  option(name: string): string | boolean | undefined {
    return this.matched.options[name];
  }

  /** All values passed for a value option, in order. */
  optionList(name: string): string[] {
    return [...(this.matched.optionLists[name] ?? [])];
  }

  hasOption(name: string): boolean {
    const value = this.matched.options[name];
    return value === true || typeof value === "string";
  }

  /** `true` only for a boolean flag that was passed. */
  flag(name: string): boolean {
    return this.matched.options[name] === true;
  }

  errors(): string[] {
    return [...this.matched.errors];
  }
}

/**
 * Base class for console commands.
 *
 * ```ts
 * export class MakeModelCommand extends Command {
 *   static signature = "make:model {name} {--m|migration}";
 *   static description = "Create a model";
 *
 *   async handle(input: CommandInput, output: Output) {
 *     output.success(`Created ${input.argument("name")}`);
 *   }
 * }
 * ```
 *
 * `handle()` returns the process exit code (`0` when nothing is returned); it
 * must not call `process.exit()` so the console can always shut the application
 * down first.
 */
export abstract class Command {
  /** Declares the command name, arguments and options. */
  static signature = "";
  /** One-line description shown by `veap list` and `veap help`. */
  static description = "";
  /** Hides the command from `list` while keeping it runnable. */
  static hidden = false;

  constructor(protected readonly context: CommandContext) {}

  abstract handle(
    input: CommandInput,
    output: Output,
  ): Promise<number | void> | number | void;
}

function constructorOf(entry: CommandEntry): typeof Command {
  return (
    typeof entry === "function" ? entry : entry.constructor
  ) as typeof Command;
}

export function commandSignature(entry: CommandEntry): CommandSignature {
  return parseSignature(constructorOf(entry).signature);
}

export function commandName(entry: CommandEntry): string {
  return commandSignature(entry).name;
}

export function commandDescription(entry: CommandEntry): string {
  return constructorOf(entry).description ?? "";
}

export function commandHidden(entry: CommandEntry): boolean {
  return constructorOf(entry).hidden === true;
}
