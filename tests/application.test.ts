import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZg==";
});

import { Application } from "../src/composition/application";
import { ServiceProvider } from "../src/ioc/service-provider";
import { logger } from "../src/logging/console-logger";

describe("Application.bootstrap error handling", () => {
  beforeEach(() => {
    const g = globalThis as any;
    delete g.__VEAP_BOOTSTRAPPED__;
    delete g.__VEAP_BOOTSTRAPPING_PROMISE__;
    delete process.env.NEXT_PHASE;
    delete process.env.SKIP_VEAP_INIT;
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZg==";
    }
  });

  afterEach(() => {
    const g = globalThis as any;
    delete g.__VEAP_BOOTSTRAPPED__;
    delete g.__VEAP_BOOTSTRAPPING_PROMISE__;
    delete process.env.NEXT_PHASE;
    delete process.env.SKIP_VEAP_INIT;
    vi.restoreAllMocks();
  });

  it("re-throws error and logs when a provider throws in boot()", async () => {
    const loggerErrorSpy = vi
      .spyOn(logger, "error")
      .mockImplementation(() => {});

    const bootError = new Error("Database connection failed");

    class FailingProvider extends ServiceProvider {
      register(): void {}
      async boot(): Promise<void> {
        throw bootError;
      }
    }

    const app = Application.configure()
      .withProviders([FailingProvider])
      .create();

    await expect(app.bootstrap()).rejects.toThrow("Database connection failed");

    const g = globalThis as any;
    expect(g.__VEAP_BOOTSTRAPPED__).toBeUndefined();
    expect(g.__VEAP_BOOTSTRAPPING_PROMISE__).toBeNull();

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      "veap:bootstrap",
      "Critical error during system initialization:",
      bootError,
    );
  });

  it("re-throws error when a provider throws in register()", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});

    const registerError = new Error("Registration error");

    class FailingProvider extends ServiceProvider {
      register(): void {
        throw registerError;
      }
    }

    const app = Application.configure()
      .withProviders([FailingProvider])
      .create();

    await expect(app.bootstrap()).rejects.toThrow("Registration error");

    const g = globalThis as any;
    expect(g.__VEAP_BOOTSTRAPPED__).toBeUndefined();
    expect(g.__VEAP_BOOTSTRAPPING_PROMISE__).toBeNull();
  });

  it("re-throws NEXT_REDIRECT without logging it as critical error", async () => {
    const loggerErrorSpy = vi
      .spyOn(logger, "error")
      .mockImplementation(() => {});

    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/install;307;",
    });

    class RedirectingProvider extends ServiceProvider {
      register(): void {}
      async boot(): Promise<void> {
        throw redirectError;
      }
    }

    const app = Application.configure()
      .withProviders([RedirectingProvider])
      .create();

    await expect(app.bootstrap()).rejects.toThrow("NEXT_REDIRECT");
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it("re-throws NEXT_NOT_FOUND without logging it as critical error", async () => {
    const loggerErrorSpy = vi
      .spyOn(logger, "error")
      .mockImplementation(() => {});

    const notFoundError = Object.assign(new Error("NEXT_NOT_FOUND"), {
      digest: "NEXT_NOT_FOUND",
    });

    class NotFoundProvider extends ServiceProvider {
      register(): void {}
      async boot(): Promise<void> {
        throw notFoundError;
      }
    }

    const app = Application.configure()
      .withProviders([NotFoundProvider])
      .create();

    await expect(app.bootstrap()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it("rejects all concurrent callers awaiting the bootstrapping promise on failure", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});

    class DelayedFailingProvider extends ServiceProvider {
      register(): void {}
      async boot(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error("Concurrent failure");
      }
    }

    const app = Application.configure()
      .withProviders([DelayedFailingProvider])
      .create();

    const first = app.bootstrap();
    const second = app.bootstrap();

    await expect(first).rejects.toThrow("Concurrent failure");
    await expect(second).rejects.toThrow("Concurrent failure");

    const g = globalThis as any;
    expect(g.__VEAP_BOOTSTRAPPED__).toBeUndefined();
    expect(g.__VEAP_BOOTSTRAPPING_PROMISE__).toBeNull();
  });

  it("allows a subsequent bootstrap attempt after a previous failure", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => {});

    let shouldFail = true;

    class TransientProvider extends ServiceProvider {
      register(): void {}
      async boot(): Promise<void> {
        if (shouldFail) {
          throw new Error("Transient network failure");
        }
      }
    }

    const app = Application.configure()
      .withProviders([TransientProvider])
      .create();

    // First attempt fails
    await expect(app.bootstrap()).rejects.toThrow("Transient network failure");
    const g = globalThis as any;
    expect(g.__VEAP_BOOTSTRAPPED__).toBeUndefined();

    // Second attempt recovers and succeeds
    shouldFail = false;
    await expect(app.bootstrap()).resolves.toBeUndefined();
    expect(g.__VEAP_BOOTSTRAPPED__).toBe(true);
  });
  it("deduplicates providers if specified multiple times", async () => {
    let registerCount = 0;
    let bootCount = 0;

    class DeduplicatedProvider extends ServiceProvider {
      register(): void {
        registerCount++;
      }
      async boot(): Promise<void> {
        bootCount++;
      }
    }

    const app = Application.configure()
      .withProviders([DeduplicatedProvider, DeduplicatedProvider])
      .create();

    await app.bootstrap();

    expect(registerCount).toBe(1);
    expect(bootCount).toBe(1);

    await app.shutdown();
  });

  it("shutdown calls provider shutdown in reverse order and resets state", async () => {
    const shutdownOrder: string[] = [];

    class FirstProvider extends ServiceProvider {
      register(): void {}
      async shutdown(): Promise<void> {
        shutdownOrder.push("first");
      }
    }

    class SecondProvider extends ServiceProvider {
      register(): void {}
      async shutdown(): Promise<void> {
        shutdownOrder.push("second");
      }
    }

    const app = Application.configure()
      .withProviders([FirstProvider, SecondProvider])
      .create();

    await app.bootstrap();
    const g = globalThis as any;
    expect(g.__VEAP_BOOTSTRAPPED__).toBe(true);

    await app.shutdown();

    expect(shutdownOrder).toEqual(["second", "first"]);
    expect(g.__VEAP_BOOTSTRAPPED__).toBeUndefined();
    expect(g.__VEAP_ACTIVE_PROVIDERS__).toEqual([]);
  });
});
