# @veap/kernel

## 0.1.3

### Patch Changes

- Add Waku.js and Web Standards HTTP adapters for `COOKIE_STORE` and `REQUEST_CONTEXT` ports:
  - `WakuRequestContext`: reads headers from `Request` (or ambient `AsyncLocalStorage`) and throws `WakuRedirect` on redirection.
  - `WakuCookieStore`: reads and parses cookies from `Request` headers and appends `Set-Cookie` headers to response headers.
  - `runWithWakuRequest`: wraps execution in an ambient `AsyncLocalStorage` request store.
  - `registerWakuHttp`: convenience helper to bind Waku adapters into the IoC container.

## 0.1.2

### Patch Changes

- Add `NextCookieStore` and `NextRequestContext` transport adapters and bind them by default in `KernelServiceProvider`.

## 0.1.1

### Patch Changes

- Fix native Node.js ESM module resolution, enhance application lifecycle and security, decouple domain configs/tokens, and add comprehensive test coverage:
  
  - Decouple domain-specific properties (`intl`, `privatePath`) from `VeapConfig` in `@veap/kernel`, allowing domain packages (`@veap/intl`, `@veap/plugins`) to augment `VeapConfig` via TypeScript Module Augmentation.
  - Update `DEFAULT_CONFIG` in kernel to an agnostic empty default (`{}`).
  - Remove all domain-specific IoC tokens (`DATABASE`, `CLI_SERVICE`, `AUTH_ROUTES`, `ROUTER_SERVICE`, `SITE_LAYOUT`, `APP_PLUGINS`, `APP_MIGRATIONS`) from `packages/kernel/src/ioc/tokens.ts`, transferring direct ownership to `@veap/database`, `@veap/auth`, and `@veap/plugins`.
  - Remove hardcoded domain methods `withMigrations` and `withPlugins` from kernel's `ApplicationBuilder` and `Application`, keeping the kernel builder purely generic (`use`, `with`, `withProviders`, `create`).
  - Fix missing `.js` extensions across all relative module imports/exports in `src/` ensuring full compliance with native Node.js ESM loaders (`ERR_MODULE_NOT_FOUND` resolution).
  - Add explicit subpath exports (`./ioc`, `./errors`, `./logging`, `./http`, `./cache`, `./config`) in `package.json`.
  - Implement graceful shutdown orchestration in `Application.prototype.shutdown()` and `Application.shutdown()`, shutting down registered service providers in reverse order (LIFO), publishing `system:stop`, and resetting bootstrap state.
  - Add `shutdown?(): void | Promise<void>` lifecycle method to `ServiceProvider`.
  - Add provider deduplication in `Application.bootstrap()` to prevent double registration when providers are registered redundantly.
  - Add disposable subscription support (`() => void`) to `EventBus.prototype.subscribe()` and add `EventBus.prototype.once()` for one-time event handlers.
  - Add `Container.prototype.reset()` to clear both cached instances and registered provider definitions in test environments.
  - Fix config path resolution in `config.loader.ts` to correctly detect `veap.config.js`.
  - Harden `verifySameOrigin` in `http/security.ts` by safely parsing multi-proxy `x-forwarded-host` headers and performing case-insensitive host comparison.
  - Add comprehensive test suites covering HTTP security (`verifySameOrigin`), `MemoryCookieStore`, `MemoryRequestContext`, `MemoryCacheProvider` TTL expiration, `AppError`/`Result`/`httpStatusForErrorCode`, disposable event subscriptions, `once()`, provider deduplication, and application shutdown (increasing test count from 35 to 67 passing tests).

## 0.1.0

### Minor Changes

- Initial public scaffold of the Veap kernel.
