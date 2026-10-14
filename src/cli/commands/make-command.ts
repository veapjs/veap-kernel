import path from "node:path";
import type { CommandInput } from "../command.js";
import { Command } from "../command.js";
import { generateCommand } from "../generator.js";
import type { Output } from "../output.js";

/**
 * `veap make:command {name}` — scaffolds a `Command` subclass in the host
 * project.
 *
 * The file lands in the project the console runs in (default `<project>/commands`)
 * and must still be registered — the console only runs commands a provider
 * contributes through `commands()` — so the command says so after writing.
 */
export class MakeCommandCommand extends Command {
  static signature =
    "make:command {name : Command name, e.g. reports:generate} {--dir=path : Directory relative to the project root (default: commands)}";
  static description = "Create a new console command class";

  async handle(input: CommandInput, output: Output): Promise<number> {
    const name = input.argument("name") ?? "";
    const dir = input.option("dir");

    const directory = path.resolve(
      this.context.root,
      typeof dir === "string" && dir.trim() !== "" ? dir.trim() : "commands",
    );

    const { filePath, className, signature } = await generateCommand(
      name,
      directory,
    );
    const relative = path.relative(this.context.root, filePath);

    output.success(`Created command: ${relative}`);
    output.info(
      `Register ${className} through a ServiceProvider's commands() method to make "${signature}" available.`,
    );

    return 0;
  }
}
