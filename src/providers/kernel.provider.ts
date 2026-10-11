import { CACHE_PROVIDER, MemoryCacheProvider } from "../cache";
import { CONFIG_SERVICE, ConfigService, VEAP_CONFIG } from "../config";
import { VeapConfigProvider } from "../config/veap-config.provider";
import { EVENT_BUS, EventBus, eventBus } from "../events";
import {
  COOKIE_STORE,
  MemoryCookieStore,
  MemoryRequestContext,
  REQUEST_CONTEXT,
} from "../http";
import { ServiceProvider } from "../ioc/service-provider";
import { ConsoleLogger, LOGGER, logger } from "../logging";

export class KernelServiceProvider extends ServiceProvider {
  register(): void {
    this.container.register({
      token: EventBus,
      useValue: eventBus,
      singleton: true,
    });

    this.container.register({
      token: EVENT_BUS,
      useValue: eventBus,
      singleton: true,
    });

    eventBus.setLogger(logger);

    this.container.register({
      token: ConsoleLogger,
      useValue: logger,
      singleton: true,
    });

    this.container.register({
      token: LOGGER,
      useValue: logger,
      singleton: true,
    });

    this.container.register({
      token: ConfigService,
      useClass: ConfigService,
      singleton: true,
    });

    this.container.register({
      token: CONFIG_SERVICE,
      useClass: ConfigService,
      singleton: true,
    });

    this.container.register({
      token: CACHE_PROVIDER,
      useClass: MemoryCacheProvider,
      singleton: true,
    });

    // IVeapConfigProvider port → the jiti `veap.config.ts` adapter
    this.container.register({
      token: VEAP_CONFIG,
      useClass: VeapConfigProvider,
      singleton: true,
    });

    // Default transport fallbacks (overridden when Next.js transport provider is loaded)
    if (!this.container.has(COOKIE_STORE)) {
      this.container.register({
        token: COOKIE_STORE,
        useClass: MemoryCookieStore,
        singleton: true,
      });
    }

    if (!this.container.has(REQUEST_CONTEXT)) {
      this.container.register({
        token: REQUEST_CONTEXT,
        useClass: MemoryRequestContext,
        singleton: true,
      });
    }
  }

  async boot(): Promise<void> {
    try {
      if (
        this.container.has(VEAP_CONFIG) &&
        this.container.has(ConfigService)
      ) {
        const configProvider = await this.container.resolve(VEAP_CONFIG);
        const veapConfig = await configProvider.get();
        const configService = await this.container.resolve(ConfigService);
        for (const [key, value] of Object.entries(veapConfig)) {
          if (value !== undefined) {
            configService.set(key, value);
          }
        }
      }
    } catch (_e) {
      // Gracefully continue if environment is client or config load fails
    }

    logger.debug(
      "veap:kernel",
      "Kernel core services registered successfully.",
    );
  }
}
