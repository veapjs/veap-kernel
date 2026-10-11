import { eventBus } from "../events/event-bus.js";
import { container } from "../ioc/container.js";
import { ServiceProvider } from "../ioc/service-provider.js";
import { logger } from "../logging/console-logger.js";

export type ProviderEntry =
  | (new (
      c: typeof container,
    ) => ServiceProvider)
  | ((c: typeof container) => ServiceProvider)
  | ServiceProvider;

export class ApplicationBuilder {
  protected customProviders: ProviderEntry[] = [];

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
    return new Application(this.customProviders);
  }
}

export class Application {
  constructor(private readonly providerEntries: ProviderEntry[]) {}

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

        const { KernelServiceProvider } = await import(
          "../providers/kernel.provider.js"
        );
        const entries = [KernelServiceProvider, ...this.providerEntries];
        const providers: ServiceProvider[] = [];
        const seenConstructors = new Set<any>();

        for (const entry of entries) {
          let providerInstance: ServiceProvider | null = null;
          let constructorRef: any = null;

          if (entry instanceof ServiceProvider) {
            providerInstance = entry;
            constructorRef = entry.constructor;
          } else if (
            typeof entry === "function" &&
            entry.prototype instanceof ServiceProvider
          ) {
            constructorRef = entry;
            providerInstance = new (entry as any)(container);
          } else if (typeof entry === "function") {
            providerInstance = (entry as any)(container);
            if (providerInstance) {
              constructorRef = providerInstance.constructor;
            }
          }

          if (providerInstance) {
            if (constructorRef && seenConstructors.has(constructorRef)) {
              continue;
            }
            if (constructorRef) {
              seenConstructors.add(constructorRef);
            }
            providers.push(providerInstance);
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

        g.__VEAP_BOOTSTRAPPED__ = true;
        g.__VEAP_BOOTSTRAPPING_PROMISE__ = null;
        g.__VEAP_ACTIVE_PROVIDERS__ = providers;

        logger.info("veap:bootstrap", "System initialized successfully.");
        await eventBus.publish("system:ready", {});
      } catch (error: any) {
        g.__VEAP_BOOTSTRAPPED__ = undefined;
        g.__VEAP_BOOTSTRAPPING_PROMISE__ = null;

        if (
          error?.message === "NEXT_REDIRECT" ||
          error?.digest?.startsWith("NEXT_REDIRECT")
        ) {
          throw error;
        }
        if (
          error?.message === "NEXT_NOT_FOUND" ||
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
      }
    })();

    return g.__VEAP_BOOTSTRAPPING_PROMISE__;
  }

  public async shutdown(): Promise<void> {
    const g = globalThis as any;
    const providers: ServiceProvider[] = g.__VEAP_ACTIVE_PROVIDERS__ || [];

    for (let i = providers.length - 1; i >= 0; i--) {
      const provider = providers[i];
      if (typeof provider.shutdown === "function") {
        try {
          await provider.shutdown();
        } catch (err: any) {
          logger.warn(
            "veap:shutdown",
            `Error shutting down provider ${provider.constructor?.name}:`,
            err?.message || err,
          );
        }
      }
    }

    try {
      await eventBus.publish("system:stop", {});
    } catch {}

    delete g.__VEAP_BOOTSTRAPPED__;
    delete g.__VEAP_BOOTSTRAPPING_PROMISE__;
    g.__VEAP_ACTIVE_PROVIDERS__ = [];
  }

  public static async shutdown(): Promise<void> {
    const app = new Application([]);
    await app.shutdown();
  }
}
