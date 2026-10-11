import type { Container } from "./container.js";

/**
 * Base class for all Service Providers in Veap.
 * Service Providers are responsible for registering and booting services.
 */
export abstract class ServiceProvider {
  constructor(protected container: Container) {}

  /**
   * Register bindings in the container.
   * Do not resolve other services here as they might not be registered yet.
   */
  abstract register(): void | Promise<void>;

  /**
   * Boot the service.
   * Called after all service providers have been registered.
   * You can safely resolve other services here.
   */
  boot?(): void | Promise<void>;

  /**
   * Teardown the service and release persistent resources (e.g. database pools, intervals, sockets).
   * Called during application shutdown or test teardown.
   */
  shutdown?(): void | Promise<void>;
}
