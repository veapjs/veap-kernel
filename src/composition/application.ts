import { eventBus } from "../events/event-bus";
import { container } from "../ioc/container";
import { ServiceProvider } from "../ioc/service-provider";
import { APP_MIGRATIONS, APP_PLUGINS } from "../ioc/tokens";
import { logger } from "../logging/console-logger";

export type ProviderEntry =
  | (new (
      c: typeof container,
    ) => ServiceProvider)
  | ((c: typeof container) => ServiceProvider)
  | ServiceProvider;

export class ApplicationBuilder {
  protected migrations: any[] = [];
  protected plugins: any[] = [];
  protected customProviders: ProviderEntry[] = [];

  public withMigrations(migrations: any[]): this {
    this.migrations = migrations;
    return this;
  }

  public withPlugins(plugins: any[]): this {
    this.plugins = plugins;
    return this;
  }

  /**
   * Register a custom ServiceProvider.
   */
  public use(provider: ProviderEntry): this {
    this.customProviders.push(provider);
    return this;
  }

  /**
   * Alias for use().
   */
  public with(provider: ProviderEntry): this {
    return this.use(provider);
  }

  public withProviders(providers: ProviderEntry[]): this {
    this.customProviders.push(...providers);
    return this;
  }

  public create(): Application {
    return new Application(this.migrations, this.plugins, this.customProviders);
  }
}

export class Application {
  constructor(
    private readonly migrations: any[],
    private readonly plugins: any[],
    private readonly providerEntries: ProviderEntry[],
  ) {}

  public static configure(): ApplicationBuilder {
    return new ApplicationBuilder();
  }

  public async bootstrap(): Promise<void> {
    if (typeof window !== "undefined") return;

    const g = globalThis as any;

    if (
      process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.SKIP_VEAP_INIT === "true"
    ) {
      return;
    }

    if (g.__VEAP_BOOTSTRAPPED__) {
      return;
    }

    if (g.__VEAP_BOOTSTRAPPING_PROMISE__) {
      return g.__VEAP_BOOTSTRAPPING_PROMISE__;
    }

    g.__VEAP_BOOTSTRAPPING_PROMISE__ = (async () => {
      try {
        logger.info("veap:bootstrap", "Starting system initialization...");

        if (this.migrations.length) {
          container.register({
            token: APP_MIGRATIONS,
            useValue: this.migrations,
          });
          container.register({
            token: "AppMigrations",
            useValue: this.migrations,
          });
        }
        if (this.plugins.length) {
          container.register({ token: APP_PLUGINS, useValue: this.plugins });
          container.register({ token: "AppPlugins", useValue: this.plugins });
        }

        const { KernelServiceProvider } = await import(
          "../providers/kernel.provider"
        );
        const entries = [KernelServiceProvider, ...this.providerEntries];
        const providers: ServiceProvider[] = [];

        for (const entry of entries) {
          if (entry instanceof ServiceProvider) {
            providers.push(entry);
          } else if (
            typeof entry === "function" &&
            entry.prototype instanceof ServiceProvider
          ) {
            providers.push(new (entry as any)(container));
          } else if (typeof entry === "function") {
            providers.push((entry as any)(container));
          }
        }

        for (const provider of providers) {
          await provider.register();
        }

        for (const provider of providers) {
          if (provider.boot) {
            await provider.boot();
          }
        }

        await eventBus.publish("system:start", { runtime: "nodejs" });

        logger.info("veap:bootstrap", "System initialized successfully.");
        g.__VEAP_BOOTSTRAPPED__ = true;
      } catch (error: any) {
        if (
          error?.digest?.startsWith("NEXT_REDIRECT") ||
          error?.digest?.startsWith("NEXT_NOT_FOUND")
        ) {
          throw error;
        }
        logger.error(
          "veap:bootstrap",
          "Critical error during system initialization:",
          error,
        );
        throw error;
      } finally {
        g.__VEAP_BOOTSTRAPPING_PROMISE__ = null;
      }
    })();

    return g.__VEAP_BOOTSTRAPPING_PROMISE__;
  }
}
