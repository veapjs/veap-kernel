import { describe, expect, it } from "vitest";
import { formatUsage, matchArgs, parseSignature } from "../src/cli/signature";
import { AppError } from "../src/errors/app-error";

/**
 * Command signatures - the contract between a command and the console.
 *
 * Covered behaviours: name/argument/option parsing, aliases, descriptions,
 * defaults, variadics, malformed signatures, and argv matching including
 * `--`, short clusters and every error path (a command must never crash on
 * bad input; it reports and exits non-zero).
 */
describe("parseSignature", () => {
  it("reads a required argument", () => {
    const signature = parseSignature("make:model {name}");

    expect(signature.name).toBe("make:model");
    expect(signature.args).toEqual([
      {
        name: "name",
        description: undefined,
        required: true,
        variadic: false,
        default: undefined,
      },
    ]);
    expect(signature.options).toEqual([]);
  });

  it("reads optional, defaulted, variadic and described arguments", () => {
    const signature = parseSignature(
      "publish {target?} {format=json} {tags* : Tags to apply}",
    );

    expect(signature.args).toEqual([
      {
        name: "target",
        description: undefined,
        required: false,
        variadic: false,
        default: undefined,
      },
      {
        name: "format",
        description: undefined,
        required: false,
        variadic: false,
        default: "json",
      },
      {
        name: "tags",
        description: "Tags to apply",
        required: false,
        variadic: true,
        default: undefined,
      },
    ]);
  });

  it("accepts the alias before or after the option name", () => {
    const parsed = parseSignature("demo {--m|migration} {--queue|Q}");

    expect(parsed.options).toEqual([
      {
        name: "migration",
        short: "m",
        description: undefined,
        flag: true,
        placeholder: undefined,
      },
      {
        name: "queue",
        short: "Q",
        description: undefined,
        flag: true,
        placeholder: undefined,
      },
    ]);
  });

  it("reads flags, aliases and value options", () => {
    const signature = parseSignature(
      "make:model {name} {--m|migration} {--f|factory} {--table=name : Target table}",
    );

    expect(signature.options).toEqual([
      {
        name: "migration",
        short: "m",
        description: undefined,
        flag: true,
        placeholder: undefined,
      },
      {
        name: "factory",
        short: "f",
        description: undefined,
        flag: true,
        placeholder: undefined,
      },
      {
        name: "table",
        short: undefined,
        description: "Target table",
        flag: false,
        placeholder: "name",
      },
    ]);
  });

  it("rejects malformed signatures", () => {
    expect(() => parseSignature("")).toThrow(AppError);
    expect(() => parseSignature("   ")).toThrow(/cannot be empty/);
    expect(() => parseSignature("{name} make:model")).toThrow(
      /not a valid command name/,
    );
    expect(() => parseSignature("make:model {name} {name}")).toThrow(
      /more than once/,
    );
    expect(() => parseSignature("make:model {--force} {--force}")).toThrow(
      /more than once/,
    );
    expect(() =>
      parseSignature("make:model {--f|force} {--factory|f}"),
    ).toThrow(/alias "f"/);
    expect(() => parseSignature("make:model {--alpha|beta}")).toThrow(
      /single character/,
    );
    expect(() => parseSignature("make:model {--x|y}")).toThrow(
      /single character/,
    );
    expect(() => parseSignature("make:model {names*} {extra}")).toThrow(
      /must be the last argument/,
    );
  });

  it("renders a usage line", () => {
    const signature = parseSignature(
      "make:model {name} {optional?} {--m|migration} {--table=name}",
    );

    expect(formatUsage(signature)).toBe(
      "veap make:model <name> [<optional>] [--migration] [--table=name]",
    );
  });
});

describe("matchArgs", () => {
  const signature = parseSignature(
    "make:model {name?} {extra?} {--m|migration} {--table=name} {--tag=value}",
  );

  it("matches positionals and long options", () => {
    const result = matchArgs(signature, [
      "Post",
      "--migration",
      "--table=blog",
    ]);

    expect(result.errors).toEqual([]);
    expect(result.arguments.name).toBe("Post");
    expect(result.options.migration).toBe(true);
    expect(result.options.table).toBe("blog");
  });

  it("matches short aliases and flag clusters", () => {
    const clustered = parseSignature("demo {--a|alpha} {--b|beta}");
    const result = matchArgs(clustered, ["-ab"]);

    expect(result.errors).toEqual([]);
    expect(result.options).toEqual({ alpha: true, beta: true });
  });

  it("consumes the next token as an option value", () => {
    const result = matchArgs(signature, ["--table", "blog"]);

    expect(result.errors).toEqual([]);
    expect(result.options.table).toBe("blog");
    // The consumed token is not treated as a positional argument.
    expect(result.arguments.name).toBeUndefined();
  });

  it("collects every value of a repeated option", () => {
    const result = matchArgs(signature, ["--tag=php", "--tag=js"]);

    expect(result.optionLists.tag).toEqual(["php", "js"]);
    expect(result.options.tag).toBe("js");
  });

  it("treats everything after -- as positional", () => {
    const result = matchArgs(parseSignature("demo {name}"), [
      "--",
      "--not-an-option",
    ]);

    expect(result.errors).toEqual([]);
    expect(result.arguments.name).toBe("--not-an-option");
  });

  it("collects variadic arguments", () => {
    const result = matchArgs(parseSignature("demo {name} {tags*}"), [
      "Post",
      "a",
      "b",
    ]);

    expect(result.errors).toEqual([]);
    expect(result.arguments.name).toBe("Post");
    expect(result.arguments.tags).toEqual(["a", "b"]);
  });

  it("applies defaults for omitted arguments", () => {
    const result = matchArgs(parseSignature("demo {format=json}"), []);

    expect(result.errors).toEqual([]);
    expect(result.arguments.format).toBe("json");
  });

  it("reports unknown options, bad values and unexpected arguments", () => {
    expect(matchArgs(signature, ["--nope"]).errors).toEqual([
      'Unknown option "--nope".',
    ]);
    expect(matchArgs(signature, ["-x"]).errors).toEqual([
      'Unknown option "-x".',
    ]);
    expect(matchArgs(signature, ["--migration=yes"]).errors).toEqual([
      'The "--migration" flag does not accept a value.',
    ]);
    expect(matchArgs(signature, ["--table"]).errors).toEqual([
      'The "--table" option requires a value.',
    ]);
    expect(matchArgs(signature, ["Post", "Extra", "TooMany"]).errors).toEqual([
      'Unexpected argument "TooMany".',
    ]);
  });

  it("reports a missing required argument", () => {
    const result = matchArgs(parseSignature("make:model {name}"), []);

    expect(result.errors).toEqual(['The "name" argument is required.']);
    expect(result.arguments.name).toBeUndefined();
  });
});
