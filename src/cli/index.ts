/**
 * `@veap/kernel/cli` — the Veap console.
 *
 * Node-only by design: this entry point reads the file system and loads the
 * project's TypeScript entry files, so it is intentionally kept out of the
 * root barrel that client components import.
 */
export * from "./command.js";
export * from "./commands/builtins.js";
export * from "./console-application.js";
export * from "./env.js";
export * from "./help.js";
export * from "./output.js";
export * from "./project.js";
export * from "./registry.js";
export * from "./signature.js";
export * from "./version.js";
