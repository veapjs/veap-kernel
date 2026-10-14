#!/usr/bin/env node
import { runConsole } from "../dist/cli/index.js";

// One command per process: resolve the project, boot the application, run the
// command, shut everything down again. `runConsole` never throws and returns the
// exit code the process should report.
runConsole().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
