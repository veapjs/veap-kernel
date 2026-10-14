import type { CommandEntry } from "../cli/command.js";
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
   * Console commands contributed by this provider.
   *
   * Collected by `Application.bootstrap()` into the global command registry, so
   * a package registers its commands once and both the web and the console
   * surfaces see them:
   *
   * ```ts
   * class DatabaseServiceProvider extends ServiceProvider {
   *   commands() {
   *     return [MakeModelCommand, MigrateCommand];
   *   }
   * }
   * ```
   *
   * Must stay side-effect free: it is called during bootstrap, after every
   * provider has registered and before any provider boots. Providers that need
   * to decide dynamically (based on config, enabled features, …) can register
   * into `commands` from `boot()` instead.
   */
  commands?(): CommandEntry[] | Promise<CommandEntry[]>;

  /**
   * Teardown the service and release persistent resources (e.g. database pools, intervals, sockets).
   * Called during application shutdown or test teardown.
   */
  shutdown?(): void | Promise<void>;
}
