import { afterEach, describe, expect, it } from "vitest";
import {
  BufferedOutput,
  ConsoleOutput,
  renderTable,
  supportsAnsi,
} from "../src/cli/output";
import { AppError } from "../src/errors/app-error";

/**
 * Output port.
 *
 * Commands never touch `console`, so this is the only place that decides how a
 * message looks. Covered behaviours: levels, stream routing, ANSI detection,
 * table alignment, queued answers and refusing to hang on a non-TTY.
 */

function fakeStream() {
  const chunks: string[] = [];
  return {
    chunks,
    text: () => chunks.join(""),
    isTTY: false,
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
  };
}

afterEach(() => {
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
});

describe("renderTable", () => {
  it("aligns columns and trims trailing padding", () => {
    const lines = renderTable(
      ["name", "description"],
      [
        ["migrate", "Run migrations"],
        ["make:model", "Create a model"],
      ],
    );

    expect(lines).toHaveLength(4);

    const [header, rule, firstRow, secondRow] = lines;
    expect(header?.startsWith("name")).toBe(true);
    expect(rule).toMatch(/^-+ +-+$/);
    // Every description starts at the same column.
    expect(firstRow?.indexOf("Run migrations")).toBe(
      secondRow?.indexOf("Create a model"),
    );
    expect(secondRow?.indexOf("Create a model")).toBe(
      header?.indexOf("description"),
    );
    expect(header).not.toMatch(/\s+$/);
  });

  it("renders a headerless list", () => {
    expect(renderTable(undefined, [["greet", "Greet someone"]])).toEqual([
      "greet  Greet someone",
    ]);
  });
});

describe("supportsAnsi", () => {
  it("follows the stream, the override and NO_COLOR", () => {
    // The runner's own environment must not leak into the assertions.
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;

    expect(supportsAnsi({ isTTY: false })).toBe(false);
    expect(supportsAnsi({ isTTY: true })).toBe(true);
    expect(supportsAnsi({ isTTY: false }, true)).toBe(true);
    expect(supportsAnsi({ isTTY: true }, false)).toBe(false);

    // NO_COLOR is a user-level opt-out and wins over the stream.
    process.env.NO_COLOR = "1";
    expect(supportsAnsi({ isTTY: true })).toBe(false);

    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = "1";
    expect(supportsAnsi({ isTTY: false })).toBe(true);
  });
});

describe("ConsoleOutput", () => {
  it("routes informational output to stdout and diagnostics to stderr", () => {
    const stdout = fakeStream();
    const stderr = fakeStream();
    const output = new ConsoleOutput({ stdout, stderr, ansi: false });

    output.success("done");
    output.warn("careful");
    output.error("boom");
    output.info("note");
    output.writeln("plain");

    expect(stdout.text()).toBe("✔ done\n› note\nplain\n");
    expect(stderr.text()).toBe("! careful\n✖ boom\n");
  });

  it("paints output only when ANSI is enabled", () => {
    const plain = fakeStream();
    new ConsoleOutput({
      stdout: plain,
      stderr: fakeStream(),
      ansi: false,
    }).success("done");
    expect(plain.text()).toBe("✔ done\n");

    const colored = fakeStream();
    new ConsoleOutput({
      stdout: colored,
      stderr: fakeStream(),
      ansi: true,
    }).success("done");
    expect(colored.text()).toContain("\u001b[32m");
  });

  it("renders table headers in bold with a dim rule", () => {
    const stdout = fakeStream();
    const output = new ConsoleOutput({
      stdout,
      stderr: fakeStream(),
      ansi: true,
    });

    output.table(["name"], [["migrate"]]);

    expect(stdout.text()).toContain("\u001b[1mname");
    expect(stdout.text()).toContain("migrate\n");
  });

  it("refuses to prompt without an interactive terminal", async () => {
    const output = new ConsoleOutput({
      stdout: fakeStream(),
      stderr: fakeStream(),
      interactive: false,
    });

    await expect(output.ask("Name?")).rejects.toThrow(AppError);
    await expect(output.ask("Name?")).rejects.toThrow(
      /not running in an interactive terminal/,
    );
  });
});

describe("BufferedOutput", () => {
  it("captures every level", () => {
    const output = new BufferedOutput();

    output.writeln("plain");
    output.info("info");
    output.success("success");
    output.warn("warn");
    output.error("error");

    expect(output.lines).toEqual(["plain", "info", "success", "warn", "error"]);
    expect(output.find("error")).toEqual(["error"]);
    expect(output.find("success")).toEqual(["success"]);
  });

  it("replays queued answers and applies defaults", async () => {
    const output = new BufferedOutput();
    output.queueAnswer("Post");
    output.queueAnswer("y");
    output.queueAnswer("");
    output.queueAnswer("");

    await expect(output.ask("Name?")).resolves.toBe("Post");
    await expect(output.confirm("Sure?")).resolves.toBe(true);
    await expect(output.ask("Name?", { default: "Draft" })).resolves.toBe(
      "Draft",
    );
    // An empty answer falls back to the default, here `false`.
    await expect(output.confirm("Sure?", { default: false })).resolves.toBe(
      false,
    );
  });

  it("fails loudly when a prompt has no queued answer", async () => {
    const output = new BufferedOutput();

    await expect(output.ask("Name?")).rejects.toThrow(/no queued answer/);
  });

  it("renders tables as plain lines", () => {
    const output = new BufferedOutput();

    output.table(["name", "description"], [["greet", "Greet someone"]]);

    expect(output.lines[0]).toContain("name");
    expect(output.lines[2]).toBe("greet  Greet someone");
  });
});
