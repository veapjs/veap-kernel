import { describe, expect, it } from "vitest";
import {
  COMMAND_CONTEXT,
  Command,
  type CommandContext,
} from "../src/cli/command";
import {
  COMMANDS,
  CommandRegistry,
  commands,
  createCommandRegistry,
} from "../src/cli/registry";
import { AppError } from "../src/errors/app-error";

/**
 * Command registry - how providers contribute commands to the console.
 *
 * Covered behaviours: class and instance registration, metadata extraction,
 * sorting, hidden commands, exact/prefix resolution, ambiguity, "did you mean"
 * suggestions, overrides and isolation between registries.
 */

class MigrateCommand extends Command {
  static signature = "migrate {--force}";
  static description = "Run the application migrations";
  handle(): number {
    return 0;
  }
}

class RollbackCommand extends Command {
  static signature = "migrate:rollback";
  static description = "Roll back the last migration batch";
  handle(): void {}
}

class SecretCommand extends Command {
  static signature = "secret";
  static description = "Hidden command";
  static hidden = true;
  handle(): void {}
}

class MakeModelCommand extends Command {
  static signature = "make:model {name}";
  static description = "Create a model";
  handle(): void {}
}

const context = {} as CommandContext;

describe("CommandRegistry", () => {
  it("registers classes and reads their metadata from the signature", () => {
    const registry = createCommandRegistry().register(MigrateCommand);
    const descriptor = registry.find("migrate");

    expect(descriptor?.description).toBe("Run the application migrations");
    expect(descriptor?.hidden).toBe(false);
    expect(descriptor?.signature.name).toBe("migrate");
    expect(descriptor?.signature.options).toHaveLength(1);
    expect(descriptor?.entry).toBe(MigrateCommand);
  });

  it("registers arrays and sorts commands by name", () => {
    const registry = createCommandRegistry().register([
      MigrateCommand,
      MakeModelCommand,
      RollbackCommand,
    ]);

    expect(registry.names()).toEqual([
      "make:model",
      "migrate",
      "migrate:rollback",
    ]);
  });

  it("registers instances, taking the name from their constructor", () => {
    const registry = createCommandRegistry().register(
      new MigrateCommand(context),
    );

    expect(registry.find("migrate")?.signature.name).toBe("migrate");
  });

  it("marks hidden commands without removing them", () => {
    const registry = createCommandRegistry().register([
      MigrateCommand,
      SecretCommand,
    ]);

    expect(registry.find("secret")?.hidden).toBe(true);
    expect(registry.names()).toContain("secret");
  });

  it("resolves exact names and unique prefixes", () => {
    const registry = createCommandRegistry().register([
      MigrateCommand,
      MakeModelCommand,
    ]);

    expect(registry.resolve("migrate").descriptor?.entry).toBe(MigrateCommand);
    expect(registry.resolve("make:m").descriptor?.entry).toBe(MakeModelCommand);
  });

  it("reports ambiguous prefixes with their candidates", () => {
    const registry = createCommandRegistry().register([
      MigrateCommand,
      RollbackCommand,
    ]);
    const ambiguous = registry.resolve("migrat");

    expect(ambiguous.descriptor).toBeUndefined();
    expect(ambiguous.ambiguous).toBe(true);
    expect(ambiguous.candidates).toEqual(["migrate", "migrate:rollback"]);

    // A longer prefix that matches a single command is not ambiguous.
    const unique = registry.resolve("migrate:");
    expect(unique.ambiguous).toBe(false);
    expect(unique.descriptor?.entry).toBe(RollbackCommand);
  });

  it("suggests the closest command for an unknown name", () => {
    const registry = createCommandRegistry().register([
      MakeModelCommand,
      MigrateCommand,
    ]);
    const resolution = registry.resolve("make:modl");

    expect(resolution.descriptor).toBeUndefined();
    expect(resolution.ambiguous).toBe(false);
    expect(resolution.candidates).toContain("make:model");
    expect(registry.suggestions("migrat")).toContain("migrate");
  });

  it("lets a later registration override an earlier one", () => {
    class OverrideCommand extends MigrateCommand {
      static override description = "Overridden";
    }

    const registry = createCommandRegistry()
      .register(MigrateCommand)
      .register(OverrideCommand);

    expect(registry.find("migrate")?.description).toBe("Overridden");
    expect(registry.all()).toHaveLength(1);
  });

  it("rejects a command without a signature", () => {
    class BrokenCommand extends Command {
      handle(): void {}
    }

    expect(() => createCommandRegistry().register(BrokenCommand)).toThrow(
      AppError,
    );
  });

  it("clears every registration", () => {
    const registry = createCommandRegistry().register(MigrateCommand);
    expect(registry.has("migrate")).toBe(true);

    registry.clear();

    expect(registry.has("migrate")).toBe(false);
    expect(registry.all()).toEqual([]);
  });

  it("exposes a process-global registry and container tokens", () => {
    expect(commands).toBeInstanceOf(CommandRegistry);
    expect(createCommandRegistry()).not.toBe(commands);
    expect(typeof COMMANDS).toBe("symbol");
    expect(typeof COMMAND_CONTEXT).toBe("symbol");
  });
});
