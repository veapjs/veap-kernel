import type { Token } from "../ioc/tokens.js";
import {
  type CommandDescriptor,
  type CommandEntry,
  type CommandRegistryLike,
  commandDescription,
  commandHidden,
  commandName,
  commandSignature,
} from "./command.js";

export interface CommandResolution {
  /** The resolved command, absent when the name is unknown or ambiguous. */
  descriptor?: CommandDescriptor;
  /** Names the caller can narrow down to when resolution failed. */
  candidates: string[];
  /** `true` when several commands matched the given prefix. */
  ambiguous: boolean;
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);

  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }

  return previous[right.length] ?? 0;
}

/**
 * Registry of every command available in the running process.
 *
 * The console ships one process-global instance ({@link commands}) so providers
 * can register commands from `register()`, `boot()` or a provider constructor
 * without any coordination or async resolution:
 *
 * ```ts
 * class DatabaseServiceProvider extends ServiceProvider {
 *   commands() {
 *     return [MakeModelCommand, MigrateCommand];
 *   }
 * }
 * ```
 */
export class CommandRegistry implements CommandRegistryLike {
  private entries = new Map<string, CommandDescriptor>();

  /** Registers one command or an array of commands. Later registrations win. */
  register(entry: CommandEntry | CommandEntry[]): this {
    const entries = Array.isArray(entry) ? entry : [entry];

    for (const item of entries) {
      const signature = commandSignature(item);
      this.entries.set(signature.name, {
        name: signature.name,
        description: commandDescription(item),
        hidden: commandHidden(item),
        signature,
        entry: item,
      });
    }

    return this;
  }

  /** Every registered command, sorted by name. */
  all(): CommandDescriptor[] {
    return [...this.entries.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  names(): string[] {
    return this.all().map((descriptor) => descriptor.name);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Exact match only — no abbreviation handling. */
  find(name: string): CommandDescriptor | undefined {
    return this.entries.get(name);
  }

  /**
   * Resolves a user-provided name: exact match first, then a unique prefix
   * (`veap migrat` → `migrate`). Ambiguous prefixes report their candidates.
   */
  resolve(name: string): CommandResolution {
    const exact = this.entries.get(name);
    if (exact) return { descriptor: exact, candidates: [], ambiguous: false };

    const prefixMatches = this.names().filter(
      (candidate) => candidate.startsWith(name) && candidate !== name,
    );

    if (prefixMatches.length === 1) {
      const [onlyMatch] = prefixMatches;
      return {
        descriptor: onlyMatch ? this.entries.get(onlyMatch) : undefined,
        candidates: [],
        ambiguous: false,
      };
    }
    if (prefixMatches.length > 1) {
      return { candidates: prefixMatches, ambiguous: true };
    }

    return { candidates: this.suggestions(name), ambiguous: false };
  }

  /** Closest command names for a "did you mean" hint. */
  suggestions(name: string): string[] {
    const namespace = name.split(":")[0];
    const names = this.names();
    const tolerance = Math.max(2, Math.ceil(name.length / 3));

    const sameNamespace = names.filter(
      (candidate) => candidate.split(":")[0] === namespace,
    );
    const similar = names.filter(
      (candidate) => levenshtein(candidate, name) <= tolerance,
    );

    return [...new Set([...sameNamespace, ...similar])]
      .filter((candidate) => candidate !== name)
      .slice(0, 5);
  }

  /** Removes every registration — used by tests and long-lived hosts. */
  clear(): void {
    this.entries.clear();
  }
}

/** The process-global registry, shared by the console and every provider. */
export const commands = new CommandRegistry();

export const COMMANDS: Token<CommandRegistry> = Symbol.for(
  "veap:kernel:commands",
);

/** Creates an isolated registry, e.g. for tests that must not share state. */
export function createCommandRegistry(): CommandRegistry {
  return new CommandRegistry();
}
