import { describe, expect, it } from "vitest";
import "reflect-metadata";
import { AppError } from "../src/errors/app-error";
import { Container } from "../src/ioc/container";
import { Inject, Injectable } from "../src/ioc/decorators";

/**
 * IoC Container - the composition mechanics of the whole system.
 *
 * Covered behaviours: value/factory/class registrations, singleton caching,
 * auto-wiring via `design:paramtypes`, explicit `@Inject` tokens for
 * interface ports, factory `inject` lists, missing-token errors, the
 * `import type` -> `Object` guard, and Laravel-style `make`/`app` helpers.
 */
describe("Container", () => {
  it("resolves a useValue registration", async () => {
    const container = new Container();
    const TOKEN = Symbol.for("test:value");
    container.register({ token: TOKEN, useValue: 42 });

    await expect(container.resolve<number>(TOKEN)).resolves.toBe(42);
  });

  it("caches singletons across resolves", async () => {
    const container = new Container();
    const TOKEN = Symbol.for("test:factory");
    let constructions = 0;
    container.register({
      token: TOKEN,
      useFactory: () => {
        constructions += 1;
        return { id: constructions };
      },
      singleton: true,
    });

    const first = await container.resolve(TOKEN);
    const second = await container.resolve(TOKEN);

    expect(constructions).toBe(1);
    expect(second).toBe(first);
  });

  it("creates a new instance on every resolve when singleton is false", async () => {
    const container = new Container();
    const TOKEN = Symbol.for("test:transient");
    container.register({
      token: TOKEN,
      useFactory: () => ({}),
      singleton: false,
    });

    const first = await container.resolve(TOKEN);
    const second = await container.resolve(TOKEN);

    expect(second).not.toBe(first);
  });

  it("resolves factory dependencies via the inject list", async () => {
    const container = new Container();
    const CONFIG = Symbol.for("test:config");
    const SERVICE = Symbol.for("test:service");
    container.register({ token: CONFIG, useValue: { env: "test" } });
    container.register({
      token: SERVICE,
      useFactory: (config: { env: string }) => ({ env: config.env }),
      inject: [CONFIG],
    });

    await expect(container.resolve(SERVICE)).resolves.toEqual({
      env: "test",
    });
  });

  it("auto-wires @Injectable classes from design:paramtypes metadata", async () => {
    const container = new Container();

    class Repo {
      public findById() {
        return "repo-data";
      }
    }

    class Service {
      constructor(public readonly repo: Repo) {}
    }
    Injectable()(Service);
    Reflect.defineMetadata("design:paramtypes", [Repo], Service);

    container.register({ token: Repo, useClass: Repo, singleton: true });
    container.register({ token: Service, useClass: Service });

    const service = await container.resolve(Service);
    expect(service.repo.findById()).toBe("repo-data");
  });

  it("honours @Inject tokens for interface ports that TS erases from metadata", async () => {
    const container = new Container();
    const LOGGER = Symbol.for("test:logger");

    interface ILogger {
      log(msg: string): void;
    }

    class Service {
      public readonly logger: ILogger;
      constructor(logger: ILogger) {
        this.logger = logger;
      }
    }
    Injectable()(Service);
    Reflect.defineMetadata("design:paramtypes", [Object], Service);
    Inject(LOGGER)(Service, undefined, 0);

    container.register({
      token: LOGGER,
      useValue: { log: (msg: string) => msg },
    });
    container.register({ token: Service, useClass: Service });

    const service = await container.resolve(Service);
    expect(service.logger.log("hi")).toBe("hi");
  });

  it("auto-instantiates unregistered classes with resolvable dependencies", async () => {
    const container = new Container();

    class Dependency {
      public value = "dep";
    }

    class Consumer {
      constructor(public readonly dependency: Dependency) {}
    }
    Injectable()(Consumer);
    Reflect.defineMetadata("design:paramtypes", [Dependency], Consumer);

    container.register({ token: Dependency, useClass: Dependency });

    const consumer = await container.resolve(Consumer);
    expect(consumer.dependency.value).toBe("dep");
  });

  it("throws AppError INTERNAL for a missing symbol token", async () => {
    const container = new Container();
    const MISSING = Symbol.for("test:missing");

    const error = await container.resolve(MISSING).catch((e) => e as Error);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("INTERNAL_SERVER_ERROR");
    expect((error as AppError).message).toContain(
      "No provider found for token",
    );
  });

  it("guards against `import type` dependencies that erase to the Object token", async () => {
    const container = new Container();

    interface Port {
      ok(): boolean;
    }

    class Broken {
      constructor(public readonly port: Port) {}
    }
    Injectable()(Broken);
    Reflect.defineMetadata("design:paramtypes", [Object], Broken);

    const error = await container.resolve(Broken).catch((e) => e as Error);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).message).toContain("`Object` token");
  });

  it("exposes has() and clear()", async () => {
    const container = new Container();
    const TOKEN = Symbol.for("test:has");
    expect(container.has(TOKEN)).toBe(false);

    container.register({ token: TOKEN, useValue: 1, singleton: true });
    expect(container.has(TOKEN)).toBe(true);

    await container.resolve(TOKEN);
    container.clear();
    // has() still sees the registration, but the cached instance is gone.
    expect(container.has(TOKEN)).toBe(true);
  });

  it("supports the Laravel-style make() alias and app() helper", async () => {
    const { app } = await import("../src/ioc/container");
    const TOKEN = Symbol.for("test:app-helper");
    app().register({ token: TOKEN, useValue: "resolved" });

    await expect(app().make(TOKEN)).resolves.toBe("resolved");
    await expect(app(TOKEN)).resolves.toBe("resolved");
  });
  it("reset() removes both cached instances and registered provider definitions", async () => {
    const container = new Container();
    const TOKEN = Symbol.for("test:reset");
    container.register({ token: TOKEN, useValue: "value" });

    expect(container.has(TOKEN)).toBe(true);

    container.reset();

    expect(container.has(TOKEN)).toBe(false);
  });

  it("call() resolves @Inject method parameters and appends extra arguments", async () => {
    const container = new Container();

    class AuthService {
      name = "auth-service";
    }

    container.register({
      token: AuthService,
      useClass: AuthService,
      singleton: true,
    });

    class SamplePlugin {
      async init(
        @Inject(AuthService) auth: AuthService,
        context?: { actor: string },
      ) {
        return `${auth.name}:${context?.actor ?? "anonymous"}`;
      }
    }

    const plugin = new SamplePlugin();
    const result = await container.call(plugin, "init", { actor: "admin" });
    expect(result).toBe("auth-service:admin");
  });
});
