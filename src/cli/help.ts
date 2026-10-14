import type { CommandDescriptor, CommandRegistryLike } from "./command.js";
import type { Output } from "./output.js";
import { formatUsage } from "./signature.js";
import { kernelVersion } from "./version.js";

/** Renders the console banner and the list of available commands. */
export function renderCommandList(
  registry: CommandRegistryLike,
  output: Output,
  version = kernelVersion(),
): void {
  const descriptors = registry.all().filter((descriptor) => !descriptor.hidden);

  output.writeln(`Veap console ${version}`);
  output.writeln();
  output.writeln("Usage:");
  output.writeln("  veap <command> [options]");
  output.writeln();
  output.writeln("Available commands:");
  output.table(
    undefined,
    descriptors.map((descriptor) => [descriptor.name, descriptor.description]),
  );
}

/** Renders the usage, arguments and options of a single command. */
export function renderCommandHelp(
  descriptor: CommandDescriptor,
  output: Output,
): void {
  const { signature } = descriptor;

  output.writeln("Usage:");
  output.writeln(`  ${formatUsage(signature)}`);

  if (descriptor.description) {
    output.writeln();
    output.writeln(descriptor.description);
  }

  if (signature.args.length > 0) {
    output.writeln();
    output.writeln("Arguments:");
    output.table(
      undefined,
      signature.args.map((arg) => [
        `${arg.variadic ? `${arg.name}...` : arg.name}${arg.default !== undefined ? ` (default: ${arg.default})` : ""}`,
        arg.description ?? (arg.required ? "Required." : "Optional."),
      ]),
    );
  }

  if (signature.options.length > 0) {
    output.writeln();
    output.writeln("Options:");
    output.table(
      undefined,
      signature.options.map((option) => [
        optionNames(option),
        option.description ??
          (option.flag ? "Flag." : `Value (${option.placeholder ?? "value"}).`),
      ]),
    );
  }
}

function optionNames(option: {
  name: string;
  short?: string;
  flag: boolean;
  placeholder?: string;
}): string {
  const value = option.flag ? "" : `=${option.placeholder ?? "value"}`;
  const alias = option.short ? `, -${option.short}` : "";
  return `--${option.name}${value}${alias}`;
}
