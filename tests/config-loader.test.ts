import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Container,
  clearVeapConfigCache,
  DEFAULT_CONFIG,
  getVeapConfig,
  VEAP_CONFIG,
  VeapConfigProvider,
} from "../src/server";

describe("ConfigLoader & VeapConfigProvider", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "veap-config-test-"));
    process.chdir(tmpDir);
    clearVeapConfigCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    clearVeapConfigCache();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns default config when no veap.config file exists", async () => {
    const config = await getVeapConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("loads veap.config.ts using jiti and merges with defaults", async () => {
    const configContent = `
      export default {
        privatePath: "/custom-admin",
        debug: true,
        intl: {
          default: "pl",
          locales: ["pl", "en"],
        },
      };
    `;
    fs.writeFileSync(path.join(tmpDir, "veap.config.ts"), configContent);

    const config = await getVeapConfig();
    expect(config.privatePath).toBe("/custom-admin");
    expect(config.debug).toBe(true);
    expect(config.intl?.default).toBe("pl");
    expect(config.intl?.locales).toEqual(["pl", "en"]);
  });

  it("resolves through VeapConfigProvider and IoC container", async () => {
    const configContent = `
      export default {
        privatePath: "/dashboard",
      };
    `;
    fs.writeFileSync(path.join(tmpDir, "veap.config.ts"), configContent);

    const container = new Container();
    container.register({
      token: VEAP_CONFIG,
      useClass: VeapConfigProvider,
      singleton: true,
    });

    const provider = await container.resolve(VEAP_CONFIG);
    const config = await provider.get();
    expect(config.privatePath).toBe("/dashboard");
  });

  it("throws error if invoked on client (window !== undefined)", async () => {
    (globalThis as any).window = {};
    try {
      await expect(getVeapConfig()).rejects.toThrow(
        "getVeapConfig can only be called on the server.",
      );
    } finally {
      delete (globalThis as any).window;
    }
  });
});
