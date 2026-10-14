import { createInterface } from "node:readline/promises";
import { AppError } from "../errors/app-error.js";

/**
 * Output port used by every command.
 *
 * Commands never write to `console` directly: the console renders through this
 * port so output can be captured in tests (`BufferedOutput`), decorated with
 * ANSI only on a TTY, and silenced with `--quiet`.
 */

export type OutputLevel = "plain" | "info" | "success" | "warn" | "error";

export interface OutputEntry {
  level: OutputLevel;
  message: string;
}

export interface AskOptions {
  default?: string;
}

export interface ConfirmOptions {
  default?: boolean;
}

export interface Output {
  /** Writes a line as-is, without a level prefix. */
  writeln(line?: string): void;
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /** Renders a table; omit `headers` for a headerless list. */
  table(headers: string[] | undefined, rows: string[][]): void;
  ask(question: string, options?: AskOptions): Promise<string>;
  confirm(question: string, options?: ConfirmOptions): Promise<boolean>;
}

/** Whether ANSI escapes should be emitted for the given stream. */
export function supportsAnsi(
  stream: { isTTY?: boolean } | undefined,
  override?: boolean,
): boolean {
  if (override !== undefined) return override;
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "")
    return false;
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== "0")
    return true;
  return Boolean(stream?.isTTY);
}

const CODES = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
} as const;

/** Renders table rows as aligned plain-text lines. */
export function renderTable(
  headers: string[] | undefined,
  rows: string[][],
  gap = 2,
): string[] {
  const widths: number[] = [];

  const consider = (cells: string[]): void => {
    cells.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    });
  };

  if (headers) consider(headers);
  for (const row of rows) consider(row);

  const format = (cells: string[]): string =>
    cells
      .map((cell, index) =>
        index === cells.length - 1
          ? cell
          : cell.padEnd(widths[index] ?? cell.length),
      )
      .join(" ".repeat(gap))
      .trimEnd();

  const lines: string[] = [];
  if (headers) {
    lines.push(format(headers));
    lines.push(
      widths
        .map((width) => "-".repeat(width))
        .join(" ".repeat(gap))
        .trimEnd(),
    );
  }
  for (const row of rows) lines.push(format(row));

  return lines;
}

export interface ConsoleOutputOptions {
  stdout?: NodeJS.WriteStream | { write(chunk: string): unknown };
  stderr?: NodeJS.WriteStream | { write(chunk: string): unknown };
  stdin?: NodeJS.ReadStream;
  ansi?: boolean;
  /** Set to `false` to make prompts fail instead of hanging in CI. */
  interactive?: boolean;
}

export class ConsoleOutput implements Output {
  private readonly stdout: { write(chunk: string): unknown };
  private readonly stderr: { write(chunk: string): unknown };
  private readonly stdin: NodeJS.ReadStream | undefined;
  private readonly ansi: boolean;
  private readonly interactive: boolean;

  constructor(options: ConsoleOutputOptions = {}) {
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
    this.stdin = options.stdin ?? process.stdin;
    this.ansi = supportsAnsi(this.stdout as { isTTY?: boolean }, options.ansi);
    this.interactive =
      options.interactive ??
      Boolean((this.stdin as { isTTY?: boolean })?.isTTY);
  }

  private paint(code: keyof typeof CODES, text: string): string {
    return this.ansi ? `${CODES[code]}${text}${CODES.reset}` : text;
  }

  writeln(line = ""): void {
    this.stdout.write(`${line}\n`);
  }

  info(message: string): void {
    this.writeln(`${this.paint("cyan", "›")} ${message}`);
  }

  success(message: string): void {
    this.writeln(`${this.paint("green", "✔")} ${message}`);
  }

  warn(message: string): void {
    this.stderr.write(`${this.paint("yellow", "!")} ${message}\n`);
  }

  error(message: string): void {
    this.stderr.write(`${this.paint("red", "✖")} ${message}\n`);
  }

  table(headers: string[] | undefined, rows: string[][]): void {
    const lines = renderTable(headers, rows);
    if (headers) {
      const [header = "", rule = "", ...body] = lines;
      this.writeln(this.paint("bold", header));
      this.writeln(this.paint("dim", rule));
      for (const line of body) this.writeln(line);
      return;
    }
    for (const line of lines) this.writeln(line);
  }

  async ask(question: string, options: AskOptions = {}): Promise<string> {
    this.assertInteractive(question);
    const prompt = options.default
      ? `${question} [${options.default}] `
      : `${question} `;
    const readline = createInterface({
      input: this.stdin as NodeJS.ReadStream,
      output: this.stdout as NodeJS.WritableStream,
    });

    try {
      const answer = (await readline.question(prompt)).trim();
      return answer || options.default || "";
    } finally {
      readline.close();
    }
  }

  async confirm(
    question: string,
    options: ConfirmOptions = {},
  ): Promise<boolean> {
    const suffix = options.default === false ? "[y/N]" : "[Y/n]";
    const answer = (
      await this.ask(`${question} ${suffix}`, { default: "" })
    ).toLowerCase();

    if (!answer) return options.default ?? true;
    return answer === "y" || answer === "yes";
  }

  private assertInteractive(question: string): void {
    if (this.interactive) return;
    throw AppError.BadRequest(
      `Cannot ask "${question}" because the console is not running in an interactive terminal. Pass the value as an argument or an option instead.`,
    );
  }
}

/**
 * In-memory output used by tests: captures every entry and replays queued
 * answers for `ask()`/`confirm()`.
 */
export class BufferedOutput implements Output {
  readonly entries: OutputEntry[] = [];
  private answers: string[] = [];

  /** Queues an answer for the next `ask()`/`confirm()` call. */
  queueAnswer(answer: string): this {
    this.answers.push(answer);
    return this;
  }

  /** Rendered text of every entry, one line per entry. */
  get lines(): string[] {
    return this.entries.map((entry) => entry.message);
  }

  text(): string {
    return this.lines.join("\n");
  }

  find(level: OutputLevel): string[] {
    return this.entries
      .filter((entry) => entry.level === level)
      .map((entry) => entry.message);
  }

  writeln(line = ""): void {
    this.entries.push({ level: "plain", message: line });
  }

  info(message: string): void {
    this.entries.push({ level: "info", message });
  }

  success(message: string): void {
    this.entries.push({ level: "success", message });
  }

  warn(message: string): void {
    this.entries.push({ level: "warn", message });
  }

  error(message: string): void {
    this.entries.push({ level: "error", message });
  }

  table(headers: string[] | undefined, rows: string[][]): void {
    for (const line of renderTable(headers, rows)) this.writeln(line);
  }

  async ask(question: string, options: AskOptions = {}): Promise<string> {
    const answer = this.answers.shift();
    if (answer === undefined) {
      throw AppError.BadRequest(
        `BufferedOutput has no queued answer for "${question}". Queue one with queueAnswer().`,
      );
    }
    return answer || options.default || "";
  }

  async confirm(
    question: string,
    options: ConfirmOptions = {},
  ): Promise<boolean> {
    const answer = (await this.ask(question, { default: "" })).toLowerCase();
    if (!answer) return options.default ?? true;
    return answer === "y" || answer === "yes";
  }
}

/**
 * Wraps an output so an unattended run can never block on a prompt.
 *
 * Used for `--no-interaction` (and, in effect, for any non-TTY run a caller
 * wires up the same way): a question that declares a default takes that default
 * — so `confirm()` guards resolve to "no" — and a question without one fails
 * loudly instead of waiting for a terminal that is not there. Commands that only
 * change the database behind a confirmation therefore stay safe in CI: the run
 * either aborts with a clear message or the caller passes `--force` to say yes
 * explicitly.
 */
export class NonInteractiveOutput implements Output {
  constructor(private readonly inner: Output) {}

  writeln(line?: string): void {
    this.inner.writeln(line);
  }

  info(message: string): void {
    this.inner.info(message);
  }

  success(message: string): void {
    this.inner.success(message);
  }

  warn(message: string): void {
    this.inner.warn(message);
  }

  error(message: string): void {
    this.inner.error(message);
  }

  table(headers: string[] | undefined, rows: string[][]): void {
    this.inner.table(headers, rows);
  }

  async ask(question: string, options: AskOptions = {}): Promise<string> {
    if (options.default !== undefined) return options.default;

    throw AppError.BadRequest(
      `${question} requires an answer, but the console runs with --no-interaction. Pass it as an argument or an option instead.`,
    );
  }

  async confirm(
    question: string,
    options: ConfirmOptions = {},
  ): Promise<boolean> {
    if (options.default !== undefined) return options.default;

    throw AppError.BadRequest(
      `${question} requires a confirmation, but the console runs with --no-interaction. Re-run with --force to accept it unattended.`,
    );
  }
}
