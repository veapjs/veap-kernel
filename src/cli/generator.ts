import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "../errors/app-error.js";

/**
 * Command scaffolding used by `veap make:command`.
 *
 * Kept free of the console — like `@veap/database`'s migration generator — so a
 * provider, a test or a future `commands/**` auto-discovery pass can call it
 * without booting an application.
 */

/** Command names become file names, class names and signatures, so keep them boring. */
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/;

export interface GeneratedCommand {
  /** Class name written into the stub, e.g. `GenerateCommand`. */
  className: string;
  /** Absolute path of the written file. */
  filePath: string;
  /** Command name declared in the stub's `signature`. */
  signature: string;
}

/**
 * `reports:generate` → `GenerateCommand`, `send-emails` → `SendEmailsCommand`.
 * Only the last namespace segment becomes the class name: the namespace stays in
 * the signature.
 */
function classNameFor(name: string): string {
  const last = name.split(":").pop() ?? name;
  const words = last.split(/[-_/]+/).filter(Boolean);
  const pascal = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  return `${pascal || "New"}Command`;
}

function commandStub(className: string, signature: string): string {
  return `import { Command, type CommandInput, type Output } from "@veap/kernel/cli";

export class ${className} extends Command {
  static signature = "${signature}";
  static description = "TODO: describe what ${signature} does.";

  handle(_input: CommandInput, output: Output): number {
    output.info("${signature} is not implemented yet.");
    return 0;
  }
}
`;
}

/**
 * Writes a new console command stub into `targetDir` (default `commands` under
 * the current directory). Refuses to overwrite an existing file.
 */
export async function generateCommand(
  name: string,
  targetDir?: string,
): Promise<GeneratedCommand> {
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    throw AppError.BadRequest("A command name is required.");
  }
  if (!NAME_PATTERN.test(trimmed)) {
    throw AppError.BadRequest(
      `The command name "${trimmed}" may only contain letters, digits, colons, dashes and underscores.`,
    );
  }

  const className = classNameFor(trimmed);
  const fileName = `${trimmed.replace(/:/g, "-")}.ts`;
  const commandsDir = targetDir || path.join(process.cwd(), "commands");
  const filePath = path.join(commandsDir, fileName);

  await fs.mkdir(commandsDir, { recursive: true });

  try {
    await fs.access(filePath);
    throw AppError.Conflict(
      `The command "${trimmed}" already exists at ${filePath}.`,
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    // ENOENT: nothing to overwrite, keep going.
  }

  await fs.writeFile(filePath, commandStub(className, trimmed), "utf-8");

  return { className, filePath, signature: trimmed };
}
