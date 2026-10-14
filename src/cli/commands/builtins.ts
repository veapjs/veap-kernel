import type { CommandEntry, CommandInput } from "../command.js";
import { Command } from "../command.js";
import { renderCommandHelp, renderCommandList } from "../help.js";
import type { Output } from "../output.js";

/** `veap list` — every command registered in this process. */
export class ListCommand extends Command {
  static signature = "list";
  static description = "List all available commands";

  handle(_input: CommandInput, output: Output): number {
    renderCommandList(this.context.registry, output);
    return 0;
  }
}

/** `veap help [command]` — the console's built-in documentation. */
export class HelpCommand extends Command {
  static signature = "help {command? : Command to describe}";
  static description = "Show help for a command";

  handle(input: CommandInput, output: Output): number {
    const name = input.argument("command");
    if (!name) {
      renderCommandList(this.context.registry, output);
      return 0;
    }

    const resolution = this.context.registry.resolve(name);
    if (resolution.ambiguous) {
      output.error(
        `Command "${name}" is ambiguous: ${resolution.candidates.join(", ")}.`,
      );
      return 1;
    }
    if (!resolution.descriptor) {
      output.error(`Command "${name}" is not defined.`);
      if (resolution.candidates.length > 0) {
        output.info(`Did you mean: ${resolution.candidates.join(", ")}?`);
      }
      return 1;
    }

    renderCommandHelp(resolution.descriptor, output);
    return 0;
  }
}

/** Built-ins are registered before providers, so a provider can override them. */
export function createBuiltinCommands(): CommandEntry[] {
  return [ListCommand, HelpCommand];
}
