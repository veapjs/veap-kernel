import { CONFIG_SERVICE, type IConfigService } from "../../config/contracts.js";
import type { CommandInput } from "../command.js";
import { Command } from "../command.js";
import type { Output } from "../output.js";

/** Renders a config value the way a shell would read it back. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * `veap config:show [key]` — the resolved configuration the application sees.
 *
 * Values come from `ConfigService`, which is seeded from `process.env` and then
 * receives the project's `veap.config.ts` during bootstrap. Without a key the
 * command lists every entry; with a key it prints `KEY=value` so a script can
 * read it without parsing a table.
 */
export class ConfigShowCommand extends Command {
  static signature = "config:show {key? : Configuration key to show}";
  static description = "Show the resolved configuration";

  async handle(input: CommandInput, output: Output): Promise<number> {
    const config = await this.loadConfig();
    const key = input.argument("key");

    if (key) {
      if (!(key in config) || config[key] === undefined) {
        output.error(`Configuration key "${key}" is not defined.`);
        return 1;
      }
      output.writeln(`${key}=${formatValue(config[key])}`);
      return 0;
    }

    const keys = Object.keys(config).sort();
    if (keys.length === 0) {
      output.info("No configuration is available.");
      return 0;
    }

    output.table(
      ["Key", "Value"],
      keys.map((name) => [name, formatValue(config[name])]),
    );

    return 0;
  }

  private async loadConfig(): Promise<Record<string, unknown>> {
    const { container } = this.context;

    if (container.has(CONFIG_SERVICE)) {
      const service = (await container.resolve(
        CONFIG_SERVICE,
      )) as IConfigService;
      return service.getAll();
    }

    // A bare application without the kernel provider still has an environment.
    return { ...process.env };
  }
}
