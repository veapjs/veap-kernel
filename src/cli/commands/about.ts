import type { CommandInput } from "../command.js";
import { Command } from "../command.js";
import type { Output } from "../output.js";
import { kernelVersion } from "../version.js";

/**
 * `veap about` — the one-screen summary of the run: which kernel, which
 * environment and project the application booted against, and how much was
 * composed on top (providers and commands).
 */
export class AboutCommand extends Command {
  static signature = "about";
  static description =
    "Show the kernel version, environment and project details";

  handle(_input: CommandInput, output: Output): number {
    const providers = this.context.application.providers();
    const commands = this.context.registry.all();

    output.writeln(`Veap ${kernelVersion()}`);
    output.writeln();
    output.table(undefined, [
      ["Environment", this.context.env],
      ["Project root", this.context.root],
      ["Node", process.version],
      ["Platform", `${process.platform} ${process.arch}`],
      ["Configured providers", String(providers.length)],
      ["Available commands", String(commands.length)],
    ]);

    return 0;
  }
}
