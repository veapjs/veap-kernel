import { AppError } from "../errors/app-error.js";

/**
 * Command signatures.
 *
 * A signature is a single Laravel-style string that declares the command name,
 * its arguments and its options:
 *
 * ```ts
 * "make:model {name} {--m|migration} {--table=name : Table to use}"
 * ```
 *
 * Grammar:
 *
 * | Token | Meaning |
 * | --- | --- |
 * | `{name}` | required argument |
 * | `{name?}` | optional argument |
 * | `{name=default}` | argument with a default value |
 * | `{name*}` | variadic argument (must be declared last) |
 * | `{--flag}` | boolean option |
 * | `{--opt\|o}` | option with a single-character alias (either order) |
 * | `{--opt=placeholder}` | option that takes a value |
 * | `{x : text}` | description for the argument or option |
 *
 * Parsing and matching are pure functions with no I/O so they can be tested in
 * isolation and reused by providers that build commands dynamically.
 */

export interface ArgumentSpec {
  name: string;
  description?: string;
  required: boolean;
  variadic: boolean;
  default?: string;
}

export interface OptionSpec {
  name: string;
  short?: string;
  description?: string;
  /** `true` for `{--flag}`, `false` for `{--opt=value}`. */
  flag: boolean;
  placeholder?: string;
}

export interface CommandSignature {
  name: string;
  args: ArgumentSpec[];
  options: OptionSpec[];
}

export interface MatchResult {
  arguments: Record<string, string | string[]>;
  options: Record<string, string | boolean>;
  optionLists: Record<string, string[]>;
  errors: string[];
}

const COMMAND_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/;
const OPTION_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/;

function splitDescription(content: string): [string, string | undefined] {
  const match = content.match(/\s+:\s+/);
  if (!match || match.index === undefined) return [content, undefined];

  return [
    content.slice(0, match.index).trim(),
    content.slice(match.index + match[0].length).trim() || undefined,
  ];
}

/**
 * Parses a command signature. Throws an `AppError` when the signature is
 * malformed, so a broken command surfaces during bootstrap instead of while a
 * user is typing it.
 */
export function parseSignature(signature: string): CommandSignature {
  const trimmed = (signature ?? "").trim();
  if (!trimmed) {
    throw AppError.Internal("A command signature cannot be empty.");
  }

  const name = trimmed.split(/\s+/)[0] ?? "";
  if (!COMMAND_NAME_PATTERN.test(name) || name.startsWith("--")) {
    throw AppError.Internal(
      `"${name}" is not a valid command name in the signature "${signature}".`,
    );
  }

  const args: ArgumentSpec[] = [];
  const options: OptionSpec[] = [];
  const rest = trimmed.slice(name.length);

  for (const match of rest.matchAll(/\{([^{}]+)\}/g)) {
    const [body, description] = splitDescription((match[1] ?? "").trim());

    if (body.startsWith("--")) {
      addOption(options, body.slice(2), description, signature);
    } else {
      addArgument(args, body, description, signature);
    }
  }

  const variadicIndex = args.findIndex((arg) => arg.variadic);
  const variadic = variadicIndex >= 0 ? args[variadicIndex] : undefined;
  if (variadic && variadicIndex !== args.length - 1) {
    throw AppError.Internal(
      `The variadic argument "{${variadic.name}*}" must be the last argument in the signature "${signature}".`,
    );
  }

  return { name, args, options };
}

function addArgument(
  args: ArgumentSpec[],
  body: string,
  description: string | undefined,
  signature: string,
): void {
  let name = body.trim();
  let required = true;
  let variadic = false;
  let defaultValue: string | undefined;

  if (name.endsWith("?")) {
    required = false;
    name = name.slice(0, -1);
  } else if (name.endsWith("*")) {
    required = false;
    variadic = true;
    name = name.slice(0, -1);
  }

  const equals = name.indexOf("=");
  if (equals >= 0) {
    defaultValue = name.slice(equals + 1);
    name = name.slice(0, equals);
    required = false;
  }

  name = name.trim();
  if (!name) {
    throw AppError.Internal(
      `An argument in the signature "${signature}" has no name.`,
    );
  }
  if (!COMMAND_NAME_PATTERN.test(name)) {
    throw AppError.Internal(
      `"${name}" is not a valid argument name in the signature "${signature}".`,
    );
  }
  if (args.some((arg) => arg.name === name)) {
    throw AppError.Internal(
      `The argument "{${name}}" is declared more than once in the signature "${signature}".`,
    );
  }

  args.push({ name, description, required, variadic, default: defaultValue });
}

function addOption(
  options: OptionSpec[],
  body: string,
  description: string | undefined,
  signature: string,
): void {
  const equals = body.indexOf("=");
  const placeholder = equals >= 0 ? body.slice(equals + 1).trim() : undefined;
  const segments = (equals >= 0 ? body.slice(0, equals) : body)
    .split("|")
    .map((part) => part.trim());

  // Both `{--name|alias}` (Laravel's spelling) and `{--alias|name}` are
  // accepted: the single-character segment is always the alias.
  let rawName = segments[0] ?? "";
  let rawShort = segments[1];

  if (rawShort !== undefined) {
    const nameIsShort = rawName.length === 1;
    const aliasIsShort = rawShort.length === 1;

    if (nameIsShort === aliasIsShort) {
      throw AppError.Internal(
        `The alias of option "--${rawName}|${rawShort}" must be a single character in the signature "${signature}".`,
      );
    }
    if (nameIsShort) {
      const declaredName = rawShort;
      rawShort = rawName;
      rawName = declaredName;
    }
  }

  if (!rawName || !OPTION_NAME_PATTERN.test(rawName)) {
    throw AppError.Internal(
      `"${rawName || body}" is not a valid option name in the signature "${signature}".`,
    );
  }

  if (
    rawShort !== undefined &&
    options.some((option) => option.short === rawShort)
  ) {
    throw AppError.Internal(
      `The option alias "${rawShort}" is declared more than once in the signature "${signature}".`,
    );
  }
  if (options.some((option) => option.name === rawName)) {
    throw AppError.Internal(
      `The option "--${rawName}" is declared more than once in the signature "${signature}".`,
    );
  }

  options.push({
    name: rawName,
    short: rawShort,
    description,
    flag: placeholder === undefined,
    placeholder,
  });
}

/** Renders the usage line of a command, e.g. `veap make:model <name> [--migration]`. */
export function formatUsage(
  signature: CommandSignature,
  binary = "veap",
): string {
  const args = signature.args
    .map((arg) => {
      if (arg.variadic) return `[<${arg.name}>...]`;
      return arg.required ? `<${arg.name}>` : `[<${arg.name}>]`;
    })
    .join(" ");

  const options = signature.options
    .map((option) =>
      option.flag
        ? `[--${option.name}]`
        : `[--${option.name}=${option.placeholder || "value"}]`,
    )
    .join(" ");

  return [binary, signature.name, args, options].filter(Boolean).join(" ");
}

/**
 * Matches raw argv tokens (without the binary and the command name) against a
 * signature.
 *
 * Invalid input never throws: every problem is collected in `errors` so a
 * console can report them all at once and exit with a non-zero code.
 */
export function matchArgs(
  signature: CommandSignature,
  argv: string[],
): MatchResult {
  const matchedArguments: Record<string, string | string[]> = {};
  const matchedOptions: Record<string, string | boolean> = {};
  const optionLists: Record<string, string[]> = {};
  const positionals: string[] = [];
  const errors: string[] = [];

  const byName = new Map(signature.options.map((o) => [o.name, o]));
  const byShort = new Map(
    signature.options
      .filter((option) => option.short !== undefined)
      .map((option) => [option.short as string, option]),
  );

  const takeOption = (option: OptionSpec, value?: string): void => {
    if (option.flag) {
      matchedOptions[option.name] = true;
      return;
    }
    if (value === undefined) {
      errors.push(`The "--${option.name}" option requires a value.`);
      return;
    }
    matchedOptions[option.name] = value;
    optionLists[option.name] = [...(optionLists[option.name] ?? []), value];
  };

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === undefined) continue;

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith("--")) {
      const body = token.slice(2);
      const equals = body.indexOf("=");
      const key = equals >= 0 ? body.slice(0, equals) : body;
      let value = equals >= 0 ? body.slice(equals + 1) : undefined;
      const option = byName.get(key);

      if (!option) {
        errors.push(`Unknown option "--${key}".`);
        continue;
      }
      if (option.flag) {
        if (value !== undefined) {
          errors.push(`The "--${option.name}" flag does not accept a value.`);
          continue;
        }
        takeOption(option);
        continue;
      }
      if (value === undefined) {
        const next = argv[index + 1];
        if (next !== undefined && (next === "-" || !next.startsWith("-"))) {
          value = next;
          index++;
        }
      }
      takeOption(option, value);
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      const cluster = token.slice(1);
      for (let position = 0; position < cluster.length; position++) {
        const key = cluster[position];
        if (key === undefined) continue;

        const option = byShort.get(key);
        if (!option) {
          errors.push(`Unknown option "-${key}".`);
          continue;
        }
        if (option.flag) {
          takeOption(option);
          continue;
        }

        let value = cluster.slice(position + 1);
        if (!value) {
          const next = argv[index + 1];
          value =
            next !== undefined && (next === "-" || !next.startsWith("-"))
              ? next
              : "";
          if (value) index++;
        }
        takeOption(option, value || undefined);
        break;
      }
      continue;
    }

    positionals.push(token);
  }

  let cursor = 0;
  for (const spec of signature.args) {
    if (spec.variadic) {
      matchedArguments[spec.name] = positionals.slice(cursor);
      cursor = positionals.length;
      continue;
    }

    const value = positionals[cursor];
    if (value === undefined) {
      if (spec.required) {
        errors.push(`The "${spec.name}" argument is required.`);
      } else if (spec.default !== undefined) {
        matchedArguments[spec.name] = spec.default;
      }
      continue;
    }

    matchedArguments[spec.name] = value;
    cursor++;
  }

  for (const extra of positionals.slice(cursor)) {
    errors.push(`Unexpected argument "${extra}".`);
  }

  return {
    arguments: matchedArguments,
    options: matchedOptions,
    optionLists,
    errors,
  };
}
